const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, shell, Tray } = require('electron');
const { SERVICE_URL, ServiceManager } = require('./service-manager');
const { SettingsStore } = require('./settings');
const {
  createTitleBarCss,
  SETTINGS_CONTENT_SIZE,
  TITLE_BAR_COLOR
} = require('./window-style');

const INTERNAL_PROTOCOL = 'file:';
const TITLE_BAR_HEIGHT = 40;
let mainWindow;
let settingsWindow;
let tray;
let settings;
let service;
let isQuitting = false;

function assetPath(...parts) {
  return path.join(__dirname, '..', ...parts);
}

function pagePath(name) {
  return path.join(__dirname, 'pages', name);
}

function secureWindowOptions(extra = {}) {
  return {
    icon: assetPath('icon.png'),
    show: false,
    backgroundColor: TITLE_BAR_COLOR,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: TITLE_BAR_COLOR,
      symbolColor: '#17212b',
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
    void window.webContents.insertCSS(createTitleBarCss(TITLE_BAR_HEIGHT));
  });
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
  mainWindow.once('ready-to-show', showMainWindow);
  void mainWindow.loadFile(pagePath('loading.html'));
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
    return service.restart();
  });
}

function wireServiceEvents() {
  service.on('starting', () => {
    if (mainWindow && !mainWindow.isDestroyed()) void mainWindow.loadFile(pagePath('loading.html'));
  });
  service.on('ready', () => {
    if (mainWindow && !mainWindow.isDestroyed()) void mainWindow.loadURL(SERVICE_URL);
  });
  service.on('failed', (error) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    void mainWindow.loadFile(pagePath('error.html'), { query: { message: error.message } });
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showMainWindow);
  app.whenReady().then(() => {
    app.setAppUserModelId('com.dsh.desktop');
    settings = new SettingsStore(path.join(app.getPath('userData'), 'settings.json'));
    service = new ServiceManager();
    registerIpc();
    createMainWindow();
    createTray();
    wireServiceEvents();
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
