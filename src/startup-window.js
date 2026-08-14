const STARTUP_CONTENT_SIZE = Object.freeze({ width: 520, height: 220 });

function createStartupWindowOptions(baseOptions = {}) {
  return {
    ...baseOptions,
    width: STARTUP_CONTENT_SIZE.width,
    height: STARTUP_CONTENT_SIZE.height,
    useContentSize: true,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false
  };
}

function isAuthorizedStartupSender(event, splashWindow) {
  return Boolean(
    splashWindow &&
    !splashWindow.isDestroyed() &&
    event.sender === splashWindow.webContents &&
    event.sender.getURL().startsWith('file:')
  );
}

module.exports = {
  STARTUP_CONTENT_SIZE,
  createStartupWindowOptions,
  isAuthorizedStartupSender
};
