const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  STARTUP_CONTENT_SIZE,
  createStartupWindowOptions,
  isAuthorizedStartupSender
} = require('../src/startup-window');

const loadingHtml = fs.readFileSync(path.join(__dirname, '../src/pages/loading.html'), 'utf8');
const styles = fs.readFileSync(path.join(__dirname, '../src/pages/styles.css'), 'utf8');
const mainSource = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const preloadSource = fs.readFileSync(path.join(__dirname, '../src/preload.js'), 'utf8');

test('startup window uses exact compact frameless dimensions', () => {
  assert.deepEqual(STARTUP_CONTENT_SIZE, { width: 520, height: 220 });
  assert.deepEqual(createStartupWindowOptions({ show: false, backgroundColor: '#fff' }), {
    show: false,
    backgroundColor: '#fff',
    width: 520,
    height: 220,
    useContentSize: true,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false
  });
});

test('startup sender authorization requires the live splash webContents and file URL', () => {
  const sender = { getURL: () => 'file:///loading.html' };
  const splashWindow = { isDestroyed: () => false, webContents: sender };

  assert.equal(isAuthorizedStartupSender({ sender }, splashWindow), true);
  assert.equal(isAuthorizedStartupSender({ sender: { getURL: () => 'file:///loading.html' } }, splashWindow), false);
  assert.equal(isAuthorizedStartupSender({ sender }, { ...splashWindow, isDestroyed: () => true }), false);
  assert.equal(isAuthorizedStartupSender({ sender: { getURL: () => 'http://127.0.0.1:3080' } }, {
    isDestroyed: () => false,
    webContents: { getURL: () => 'http://127.0.0.1:3080' }
  }), false);
});

test('startup page hides overflow and separates drag and control regions', () => {
  assert.match(loadingHtml, /<body class="startup-page">/);
  assert.match(loadingHtml, /class="startup-drag-region"/);
  assert.match(styles, /body\.startup-page\s*\{[^}]*overflow:\s*hidden/s);
  assert.match(styles, /\.startup-drag-region\s*\{[^}]*-webkit-app-region:\s*drag/s);
  assert.match(styles, /\.startup-window-controls\s*\{[^}]*-webkit-app-region:\s*no-drag/s);
});

test('startup page exposes accessible minimize and close controls', () => {
  assert.match(loadingHtml, /id="startup-minimize"[^>]*aria-label="最小化"[^>]*title="最小化"/);
  assert.match(loadingHtml, /id="startup-close"[^>]*aria-label="关闭"[^>]*title="关闭"/);
  assert.match(loadingHtml, /<script src="loading\.js"><\/script>/);
});

test('preload exposes only named startup window commands', () => {
  assert.match(preloadSource, /minimizeStartup:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('startup:minimize'\)/);
  assert.match(preloadSource, /closeStartup:\s*\(\)\s*=>\s*ipcRenderer\.invoke\('startup:close'\)/);
});

test('main process owns a separate splash lifecycle', () => {
  assert.match(mainSource, /let splashWindow;/);
  assert.match(mainSource, /function createSplashWindow\(\)/);
  assert.match(mainSource, /function closeSplashWindow\(\)/);
  assert.match(mainSource, /function showStartupState\(\)/);
  assert.doesNotMatch(mainSource, /mainWindow\.loadFile\(pagePath\('loading\.html'\)\)/);
  assert.match(mainSource, /service\.on\('ready',[\s\S]*closeSplashWindow\(\)[\s\S]*mainWindow\.loadURL\(SERVICE_URL\)\.then\(showMainWindow\)/);
  assert.match(mainSource, /service\.on\('failed',[\s\S]*closeSplashWindow\(\)[\s\S]*mainWindow\.loadFile\(pagePath\('error\.html'\)[\s\S]*\.then\(showMainWindow\)/);
});

test('startup IPC authorizes the splash sender before controlling the window', () => {
  assert.match(mainSource, /ipcMain\.handle\('startup:minimize',[\s\S]*isAuthorizedStartupSender\(event, splashWindow\)[\s\S]*splashWindow\.minimize\(\)/);
  assert.match(mainSource, /ipcMain\.handle\('startup:close',[\s\S]*isAuthorizedStartupSender\(event, splashWindow\)[\s\S]*quitApplication\(\)/);
  assert.match(mainSource, /ipcMain\.handle\('service:retry',[\s\S]*showStartupState\(\)[\s\S]*service\.restart\(\)/);
});
