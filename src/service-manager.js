const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');
const http = require('node:http');
const { releasePort } = require('./port-cleanup');

const SERVICE_URL = 'http://127.0.0.1:3080';
const DSH_COMMAND = Object.freeze({
  file: 'powershell.exe',
  args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', 'dsh web --no-open']
});

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function defaultProbe() {
  return new Promise((resolve) => {
    const request = http.get(SERVICE_URL, { timeout: 1000 }, (response) => {
      response.resume();
      resolve(true);
    });
    request.on('error', () => resolve(false));
    request.on('timeout', () => {
      request.destroy();
      resolve(false);
    });
  });
}

function defaultSpawnProcess() {
  return spawn(DSH_COMMAND.file, DSH_COMMAND.args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function defaultKillTree(pid) {
  return new Promise((resolve) => {
    const killer = spawn('taskkill.exe', ['/pid', String(pid), '/t', '/f'], {
      windowsHide: true,
      stdio: 'ignore'
    });
    killer.once('error', () => resolve());
    killer.once('exit', () => resolve());
  });
}

class ServiceManager extends EventEmitter {
  constructor(options = {}) {
    super();
    this.spawnProcess = options.spawnProcess ?? defaultSpawnProcess;
    this.releaseServicePort = options.releaseServicePort ?? (() => releasePort(3080));
    this.probe = options.probe ?? defaultProbe;
    this.killTree = options.killTree ?? defaultKillTree;
    this.pollIntervalMs = options.pollIntervalMs ?? 500;
    this.timeoutMs = options.timeoutMs ?? 30000;
    this.state = 'stopped';
    this.child = null;
    this.generation = 0;
  }

  start() {
    if (this.child) return;

    const generation = ++this.generation;
    this.state = 'starting';
    this.emit('starting');
    void this.startAfterPreflight(generation);
  }

  async startAfterPreflight(generation) {
    try {
      await this.releaseServicePort();
    } catch (error) {
      this.fail(generation, error);
      return;
    }
    if (generation !== this.generation || this.state !== 'starting') return;

    let child;
    try {
      child = this.spawnProcess();
    } catch (error) {
      this.fail(generation, error);
      return;
    }
    this.child = child;
    let diagnostics = '';
    const appendDiagnostics = (data) => {
      diagnostics = `${diagnostics}${data.toString()}`.slice(-8000);
    };
    child.stdout?.on('data', appendDiagnostics);
    child.stderr?.on('data', appendDiagnostics);
    child.once('error', (error) => this.fail(generation, error));
    child.once('exit', (code) => {
      if (generation !== this.generation || this.state === 'stopped') return;
      const detail = diagnostics.trim();
      this.fail(generation, new Error(
        `dsh web exited with code ${code}.${detail ? `\n\n${detail}` : ''}`
      ));
    });

    void this.waitUntilReady(generation);
  }

  async waitUntilReady(generation) {
    const deadline = Date.now() + this.timeoutMs;
    while (generation === this.generation && this.child && Date.now() < deadline) {
      if (await this.probe()) {
        if (generation === this.generation && this.child) {
          this.state = 'ready';
          this.emit('ready', SERVICE_URL);
        }
        return;
      }
      await delay(this.pollIntervalMs);
    }

    if (generation === this.generation && this.child) {
      const error = new Error(`dsh web did not become ready within ${this.timeoutMs} ms.`);
      await this.stop();
      this.state = 'failed';
      this.emit('failed', error);
    }
  }

  fail(generation, error) {
    if (generation !== this.generation) return;
    this.child = null;
    this.state = 'failed';
    this.emit('failed', error instanceof Error ? error : new Error(String(error)));
  }

  async stop() {
    const child = this.child;
    ++this.generation;
    this.child = null;
    this.state = 'stopped';
    if (child?.pid) await this.killTree(child.pid);
  }

  async restart() {
    await this.stop();
    this.start();
  }
}

module.exports = {
  SERVICE_URL,
  DSH_COMMAND,
  ServiceManager,
  defaultKillTree,
  defaultProbe,
  defaultSpawnProcess
};
