const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { SettingsStore, normalizeSettings } = require('../src/settings');

test('normalizeSettings defaults missing and invalid values to ask', () => {
  assert.deepEqual(normalizeSettings(), { closeBehavior: 'ask' });
  assert.deepEqual(normalizeSettings({ closeBehavior: 'invalid' }), { closeBehavior: 'ask' });
});

test('normalizeSettings preserves supported close behavior', () => {
  assert.deepEqual(normalizeSettings({ closeBehavior: 'tray' }), { closeBehavior: 'tray' });
  assert.deepEqual(normalizeSettings({ closeBehavior: 'quit' }), { closeBehavior: 'quit' });
});

test('SettingsStore persists close behavior and reloads it', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-settings-'));
  const filePath = path.join(directory, 'settings.json');
  const store = new SettingsStore(filePath);

  assert.equal(store.getCloseBehavior(), 'ask');
  store.setCloseBehavior('tray');

  assert.equal(new SettingsStore(filePath).getCloseBehavior(), 'tray');
});

test('SettingsStore rejects unsupported close behavior', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-settings-'));
  const store = new SettingsStore(path.join(directory, 'settings.json'));

  assert.throws(() => store.setCloseBehavior('sometimes'), /Unsupported close behavior/);
});
