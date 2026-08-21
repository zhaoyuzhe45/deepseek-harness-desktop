const TITLE_BAR_COLOR = '#f4f6f8';
const DARK_TITLE_BAR_COLOR = '#202124';
const SETTINGS_CONTENT_SIZE = Object.freeze({ width: 560, height: 590 });

function createTitleBarCss(height, dark = false) {
  const color = dark ? DARK_TITLE_BAR_COLOR : TITLE_BAR_COLOR;
  return `
    html {
      box-sizing: border-box !important;
      padding-top: ${height}px !important;
    }
    html::before {
      content: "";
      position: fixed;
      z-index: 2147483646;
      top: 0;
      right: 0;
      left: 0;
      height: ${height}px;
      background: ${color};
      -webkit-app-region: no-drag;
      user-select: none;
    }
    html::after {
      content: "";
      position: fixed;
      z-index: 2147483647;
      top: 0;
      right: 138px;
      left: 0;
      height: ${height}px;
      -webkit-app-region: drag;
      user-select: none;
    }
  `;
}

module.exports = { createTitleBarCss, DARK_TITLE_BAR_COLOR, SETTINGS_CONTENT_SIZE, TITLE_BAR_COLOR };
