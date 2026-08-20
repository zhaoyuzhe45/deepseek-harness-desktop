const assert = require('node:assert/strict');
const { EventEmitter, once } = require('node:events');
const test = require('node:test');

const { ServiceManager, DSH_COMMAND } = require('../src/service-manager');

test('uses PowerShell to run the current dsh.ps1 command without opening a browser', () => {
  assert.equal(DSH_COMMAND.file, 'powershell.exe');
  assert.deepEqual(DSH_COMMAND.args, [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', 'dsh web --no-open'
  ]);
});

function childProcess(pid = 100) {
  const child = new EventEmitter();
  child.pid = pid;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  return child;
}

test('start emits ready after the endpoint responds', async () => {
  const child = childProcess();
  let probes = 0;
  const manager = new ServiceManager({
    spawnProcess: () => child,
    releaseServicePort: async () => {},
    probe: async () => ++probes >= 2,
    killTree: async () => {},
    pollIntervalMs: 1,
    timeoutMs: 100
  });

  const ready = once(manager, 'ready');
  manager.start();
  await ready;

  assert.equal(probes, 2);
  assert.equal(manager.state, 'ready');
});

test('start reports an early process exit with captured diagnostics', async () => {
  const child = childProcess();
  const manager = new ServiceManager({
    spawnProcess: () => child,
    releaseServicePort: async () => {},
    probe: async () => false,
    killTree: async () => {},
    pollIntervalMs: 1,
    timeoutMs: 100
  });

  const failed = once(manager, 'failed');
  manager.start();
  await new Promise((resolve) => setImmediate(resolve));
  child.stderr.emit('data', Buffer.from('dsh command failed'));
  child.emit('exit', 1);
  const [error] = await failed;

  assert.match(error.message, /exited with code 1/);
  assert.match(error.message, /dsh command failed/);
  assert.equal(manager.state, 'failed');
});

test('start times out and stops the child process', async () => {
  const child = childProcess();
  const killed = [];
  const manager = new ServiceManager({
    spawnProcess: () => child,
    releaseServicePort: async () => {},
    probe: async () => false,
    killTree: async (pid) => killed.push(pid),
    pollIntervalMs: 1,
    timeoutMs: 5
  });

  const failed = once(manager, 'failed');
  manager.start();
  const [error] = await failed;

  assert.match(error.message, /did not become ready/);
  assert.deepEqual(killed, [100]);
});

test('restart stops the current child before starting another', async () => {
  const children = [childProcess(100), childProcess(200)];
  const killed = [];
  const manager = new ServiceManager({
    spawnProcess: () => children.shift(),
    releaseServicePort: async () => {},
    probe: async () => true,
    killTree: async (pid) => killed.push(pid),
    pollIntervalMs: 1,
    timeoutMs: 100
  });

  manager.start();
  await once(manager, 'ready');
  const restarting = once(manager, 'ready');
  await manager.restart();
  await restarting;

  assert.deepEqual(killed, [100]);
  assert.equal(manager.child.pid, 200);
});

test('stop is idempotent and terminates only the active child', async () => {
  const child = childProcess();
  const killed = [];
  const manager = new ServiceManager({
    spawnProcess: () => child,
    releaseServicePort: async () => {},
    probe: async () => true,
    killTree: async (pid) => killed.push(pid),
    pollIntervalMs: 1,
    timeoutMs: 100
  });

  manager.start();
  await once(manager, 'ready');
  await manager.stop();
  await manager.stop();

  assert.deepEqual(killed, [100]);
  assert.equal(manager.state, 'stopped');
});

test('start releases port 3080 before spawning the service', async () => {
  const child = childProcess();
  const order = [];
  const manager = new ServiceManager({
    releaseServicePort: async () => order.push('release'),
    spawnProcess: () => { order.push('spawn'); return child; },
    probe: async () => true,
    killTree: async () => {},
    pollIntervalMs: 1,
    timeoutMs: 100
  });

  const ready = once(manager, 'ready');
  manager.start();
  await ready;
  assert.deepEqual(order, ['release', 'spawn']);
});

test('start reports port cleanup failure without spawning', async () => {
  let spawns = 0;
  const manager = new ServiceManager({
    releaseServicePort: async () => { throw new Error('Port cleanup failed'); },
    spawnProcess: () => { spawns += 1; return childProcess(); },
    probe: async () => true,
    killTree: async () => {}
  });

  const failed = once(manager, 'failed');
  manager.start();
  const [error] = await failed;
  assert.match(error.message, /Port cleanup failed/);
  assert.equal(spawns, 0);
});

test('stop during port cleanup prevents a late service spawn', async () => {
  let finishCleanup;
  let spawns = 0;
  const manager = new ServiceManager({
    releaseServicePort: () => new Promise((resolve) => { finishCleanup = resolve; }),
    spawnProcess: () => { spawns += 1; return childProcess(); },
    probe: async () => true,
    killTree: async () => {}
  });

  manager.start();
  await new Promise((resolve) => setImmediate(resolve));
  await manager.stop();
  finishCleanup();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(spawns, 0);
  assert.equal(manager.state, 'stopped');
});
