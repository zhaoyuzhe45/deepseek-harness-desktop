const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

function normalizePids(values) {
  const list = Array.isArray(values) ? values : values == null ? [] : [values];
  const pids = list.map(Number);
  if (pids.some((pid) => !Number.isSafeInteger(pid) || pid <= 0)) {
    throw new Error('Port owner query returned an invalid PID.');
  }
  return [...new Set(pids)];
}

function parseOwnerPids(output) {
  const text = output.trim();
  if (!text) return [];
  return normalizePids(JSON.parse(text));
}

function parseNetstatOwners(output, port) {
  const owners = [];
  for (const line of String(output ?? '').split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 5 || fields[0].toUpperCase() !== 'TCP') continue;
    const state = fields[3].toUpperCase();
    const local = fields[1].replace(/^\[|\]$/g, '');
    const localPort = Number(local.slice(local.lastIndexOf(':') + 1));
    const pid = Number(fields[4]);
    if (state === 'LISTENING' && localPort === port && Number.isSafeInteger(pid) && pid > 0) owners.push(pid);
  }
  return [...new Set(owners)];
}

async function queryPortOwners(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid TCP port: ${port}`);
  }
  const { stdout } = await execFileAsync('netstat.exe', ['-ano', '-p', 'tcp'], { windowsHide: true, timeout: 10000 });
  return parseNetstatOwners(stdout, port);
}

async function killProcessTree(pid) {
  try {
    await execFileAsync('taskkill.exe', ['/pid', String(pid), '/t', '/f'], {
      windowsHide: true,
      timeout: 10000
    });
  } catch (error) {
    const detail = error.stderr?.trim() || error.message;
    throw new Error(detail);
  }
}

async function releasePort(port, dependencies = {}) {
  const queryOwners = dependencies.queryOwners ?? queryPortOwners;
  const killTree = dependencies.killTree ?? killProcessTree;
  const owners = normalizePids(await queryOwners(port));

  for (const pid of owners) {
    try {
      await killTree(pid);
    } catch (error) {
      throw new Error(`Unable to terminate PID ${pid} on port ${port}: ${error.message}`);
    }
  }

  if (owners.length === 0) return;
  const remaining = normalizePids(await queryOwners(port));
  if (remaining.length > 0) {
    throw new Error(`TCP port ${port} is still occupied by PID: ${remaining.join(', ')}.`);
  }
}

module.exports = {
  killProcessTree,
  parseNetstatOwners,
  queryPortOwners,
  releasePort
};
