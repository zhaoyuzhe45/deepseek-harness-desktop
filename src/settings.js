const fs = require('node:fs');
const path = require('node:path');

const CLOSE_BEHAVIORS = new Set(['ask', 'tray', 'quit']);

function normalizeSettings(value) {
  const closeBehavior = CLOSE_BEHAVIORS.has(value?.closeBehavior)
    ? value.closeBehavior
    : 'ask';

  return { closeBehavior };
}

class SettingsStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.settings = this.load();
  }

  load() {
    try {
      return normalizeSettings(JSON.parse(fs.readFileSync(this.filePath, 'utf8')));
    } catch {
      return normalizeSettings();
    }
  }

  getCloseBehavior() {
    return this.settings.closeBehavior;
  }

  setCloseBehavior(closeBehavior) {
    if (!CLOSE_BEHAVIORS.has(closeBehavior)) {
      throw new Error(`Unsupported close behavior: ${closeBehavior}`);
    }

    this.settings = { closeBehavior };
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(this.settings, null, 2)}\n`, 'utf8');
    fs.renameSync(temporaryPath, this.filePath);
    return this.settings;
  }
}

module.exports = { CLOSE_BEHAVIORS, SettingsStore, normalizeSettings };
