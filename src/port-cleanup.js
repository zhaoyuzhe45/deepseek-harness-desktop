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

function buildOwnerQueryScript(port) {
  return [
    `$owners = @(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue`,
    '| Select-Object -ExpandProperty OwningProcess -Unique);',
    'ConvertTo-Json -Compress -InputObject $owners'
  ].join(' ');
}

async function queryPortOwners(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid TCP port: ${port}`);
  }
  const script = buildOwnerQueryScript(port);
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
    { windowsHide: true, timeout: 10000 }
  );
  return parseOwnerPids(stdout);
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
  buildOwnerQueryScript,
  killProcessTree,
  parseOwnerPids,
  queryPortOwners,
  releasePort
};
