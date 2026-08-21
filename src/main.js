const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, nativeTheme, shell, Tray } = require('electron');
const { SERVICE_URL, ServiceManager } = require('./service-manager');
const { SettingsStore } = require('./settings');
const {
  createStartupWindowOptions,
  isAuthorizedStartupSender
} = require('./startup-window');
const {
  createTitleBarCss,
  SETTINGS_CONTENT_SIZE,
  TITLE_BAR_COLOR
} = require('./window-style');

const INTERNAL_PROTOCOL = 'file:';
const TITLE_BAR_HEIGHT = 40;
let mainWindow;
let splashWindow;
let settingsWindow;
let tray;
let settings;
let service;
let isQuitting = false;
let isClosingSplashForTransition = false;

function assetPath(...parts) {
  return path.join(__dirname, '..', ...parts);
}

function pagePath(name) {
  return path.join(__dirname, 'pages', name);
}

function secureWindowOptions(extra = {}) {
  const dark = nativeTheme.shouldUseDarkColors;
  return {
    icon: assetPath('icon.png'),
    show: false,
    backgroundColor: dark ? '#202124' : TITLE_BAR_COLOR,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: dark ? '#202124' : TITLE_BAR_COLOR,
      symbolColor: dark ? '#f1f3f4' : '#17212b',
      height: TITLE_BAR_HEIGHT
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    ...extra
  };
}

function configureTitleBarInset(window) {
  window.webContents.on('did-finish-load', () => {
    void window.webContents.insertCSS(createTitleBarCss(TITLE_BAR_HEIGHT, nativeTheme.shouldUseDarkColors));
  });
}

function updateWindowTheme() {
  const dark = nativeTheme.shouldUseDarkColors;
  const color = dark ? '#202124' : TITLE_BAR_COLOR;
  const symbolColor = dark ? '#f1f3f4' : '#17212b';
  for (const window of [mainWindow, settingsWindow]) {
    if (!window || window.isDestroyed()) continue;
    window.setTitleBarOverlay({ color, symbolColor, height: TITLE_BAR_HEIGHT });
    void window.webContents.insertCSS(createTitleBarCss(TITLE_BAR_HEIGHT, dark));
  }
}

function configureNavigation(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(SERVICE_URL)) return { action: 'allow' };
    void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    const parsed = new URL(url);
    if (parsed.protocol === INTERNAL_PROTOCOL || url.startsWith(SERVICE_URL)) return;
    event.preventDefault();
    void shell.openExternal(url);
  });
}

function showMainWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    if (splashWindow.isMinimized()) splashWindow.restore();
    splashWindow.show();
    splashWindow.focus();
    return;
  }
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

async function chooseCloseAction() {
  const behavior = settings.getCloseBehavior();
  if (behavior !== 'ask') return behavior;

  const result = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    title: '关闭 DSH Desktop',
    message: '您希望最小化到托盘，还是完全退出应用？',
    detail: '最小化到托盘后，dsh web 服务将继续运行。',
    buttons: ['最小化到托盘', '完全退出', '取消'],
    defaultId: 0,
    cancelId: 2,
    checkboxLabel: '记住我的选择',
    checkboxChecked: false,
    noLink: true
  });

  if (result.response === 2) return 'cancel';
  const action = result.response === 0 ? 'tray' : 'quit';
  if (result.checkboxChecked) settings.setCloseBehavior(action);
  return action;
}

async function quitApplication() {
  if (isQuitting) return;
  isQuitting = true;
  await service.stop();
  app.quit();
}

function createMainWindow() {
  mainWindow = new BrowserWindow(secureWindowOptions({
    title: 'DSH Desktop',
    width: 1280,
    height: 820,
    minWidth: 800,
    minHeight: 560
  }));
  mainWindow.setMenu(null);
  configureTitleBarInset(mainWindow);
  configureNavigation(mainWindow);
  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    void chooseCloseAction().then((action) => {
      if (action === 'tray') mainWindow.hide();
      if (action === 'quit') void quitApplication();
    });
  });
}

function closeSplashWindow() {
  if (!splashWindow || splashWindow.isDestroyed()) {
    splashWindow = null;
    return;
  }
  isClosingSplashForTransition = true;
  splashWindow.destroy();
  splashWindow = null;
  isClosingSplashForTransition = false;
}

function createSplashWindow() {
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.show();
    splashWindow.focus();
    return;
  }

  isClosingSplashForTransition = false;
  splashWindow = new BrowserWindow(createStartupWindowOptions(secureWindowOptions({
    title: '正在启动 DSH',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#202124' : '#ffffff',
    center: true,
    hasShadow: true
  })));
  splashWindow.setMenu(null);
  configureNavigation(splashWindow);
  splashWindow.on('close', (event) => {
    if (isQuitting || isClosingSplashForTransition) return;
    event.preventDefault();
    void quitApplication();
  });
  splashWindow.on('closed', () => { splashWindow = null; });
  splashWindow.once('ready-to-show', () => {
    if (!splashWindow || splashWindow.isDestroyed()) return;
    splashWindow.show();
    splashWindow.focus();
  });
  void splashWindow.loadFile(pagePath('loading.html'));
}

function showStartupState() {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
  createSplashWindow();
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow(secureWindowOptions({
    title: 'DSH Desktop 设置',
    width: SETTINGS_CONTENT_SIZE.width,
    height: SETTINGS_CONTENT_SIZE.height,
    useContentSize: true,
    parent: mainWindow,
    modal: false,
    resizable: false
  }));
  settingsWindow.setMenu(null);
  configureTitleBarInset(settingsWindow);
  configureNavigation(settingsWindow);
  settingsWindow.once('ready-to-show', () => settingsWindow.show());
  settingsWindow.on('closed', () => { settingsWindow = null; });
  void settingsWindow.loadFile(pagePath('settings.html'));
}

function createTray() {
  const image = nativeImage.createFromPath(assetPath('icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(image);
  tray.setToolTip('DSH Desktop');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '显示窗口', click: showMainWindow },
    { label: '重新启动服务', click: () => { showMainWindow(); void service.restart(); } },
    { label: '设置', click: createSettingsWindow },
    { type: 'separator' },
    { label: '退出', click: () => void quitApplication() }
  ]));
  tray.on('double-click', showMainWindow);
}

function registerIpc() {
  ipcMain.handle('startup:minimize', (event) => {
    if (!isAuthorizedStartupSender(event, splashWindow)) throw new Error('Unauthorized IPC sender');
    splashWindow.minimize();
  });
  ipcMain.handle('startup:close', (event) => {
    if (!isAuthorizedStartupSender(event, splashWindow)) throw new Error('Unauthorized IPC sender');
    return quitApplication();
  });
  ipcMain.handle('settings:get-close-behavior', (event) => {
    if (!event.sender.getURL().startsWith('file:')) throw new Error('Unauthorized IPC sender');
    return settings.getCloseBehavior();
  });
  ipcMain.handle('settings:set-close-behavior', (event, value) => {
    if (!event.sender.getURL().startsWith('file:')) throw new Error('Unauthorized IPC sender');
    return settings.setCloseBehavior(value).closeBehavior;
  });
  ipcMain.handle('service:retry', (event) => {
    if (!event.sender.getURL().startsWith('file:')) throw new Error('Unauthorized IPC sender');
    showStartupState();
    return service.restart();
  });
}

function wireServiceEvents() {
  service.on('starting', () => {
    showStartupState();
  });
  service.on('ready', () => {
    closeSplashWindow();
    if (mainWindow && !mainWindow.isDestroyed()) void mainWindow.loadURL(SERVICE_URL).then(showMainWindow);
  });
  service.on('failed', (error) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    closeSplashWindow();
    void mainWindow.loadFile(pagePath('error.html'), { query: { message: error.message } }).then(showMainWindow);
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);
  app.whenReady().then(() => {
    nativeTheme.on('updated', updateWindowTheme);
    app.setAppUserModelId('com.dsh.desktop');
    settings = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'));
    service = new ServiceManager();
    registerIpc();
    createMainWindow();
    createTray();
    wireServiceEvents();
    showStartupState();
    service.start();
  });
  app.on('activate', showMainWindow);
  app.on('window-all-closed', () => {});
  app.on('before-quit', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      void quitApplication();
    }
  });
}
