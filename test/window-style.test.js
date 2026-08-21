const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  createTitleBarCss,
  DARK_TITLE_BAR_COLOR,
  SETTINGS_CONTENT_SIZE,
  TITLE_BAR_COLOR
} = require('../src/window-style');

test('title bar CSS creates a draggable region without covering caption buttons', () => {
  const css = createTitleBarCss(40);
  assert.match(css, /padding-top:\s*40px/);
  assert.match(css, /html::before\s*\{[^}]*right:\s*0[^}]*background:\s*#f4f6f8[^}]*-webkit-app-region:\s*no-drag/s);
  assert.match(css, /html::after\s*\{[^}]*right:\s*138px[^}]*-webkit-app-region:\s*drag/s);
  assert.match(css, /height:\s*40px/);
  assert.equal(TITLE_BAR_COLOR, '#f4f6f8');
  assert.match(css, /background:\s*#f4f6f8/);
});

test('title bar CSS supports dark mode colors', () => {
  const css = createTitleBarCss(40, true);
  assert.match(css, new RegExp(`background:\\s*${DARK_TITLE_BAR_COLOR}`));
});

test('settings page uses fixed complete dimensions without scrollbars', () => {
  assert.deepEqual(SETTINGS_CONTENT_SIZE, { width: 560, height: 590 });
  const script = fs.readFileSync(path.join(__dirname, '../src/pages/settings.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../src/pages/styles.css'), 'utf8');
  assert.match(script, /document\.body\.classList\.add\('settings-page'\)/);
  assert.match(css, /body\.settings-page\s*\{[^}]*overflow:\s*hidden/s);
});
