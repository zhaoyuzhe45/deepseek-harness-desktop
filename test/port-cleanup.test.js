const assert = require('node:assert/strict');
const test = require('node:test');

const { parseNetstatOwners, releasePort } = require('../src/port-cleanup');

test('parseNetstatOwners finds unique listening PIDs for the requested local port', () => {
  const output = [
    '  TCP    127.0.0.1:3080       0.0.0.0:0       LISTENING       42',
    '  TCP    [::1]:3080           [::]:0          LISTENING       42',
    '  TCP    127.0.0.1:3081       0.0.0.0:0       LISTENING       17',
    '  TCP    127.0.0.1:3080       127.0.0.1:50000 ESTABLISHED     99'
  ].join('\r\n');
  assert.deepEqual(parseNetstatOwners(output, 3080), [42]);
  assert.deepEqual(parseNetstatOwners('', 3080), []);
});

test('releasePort returns without killing when the port has no owner', async () => {
  let kills = 0;
  await releasePort(3080, {
    queryOwners: async () => [],
    killTree: async () => { kills += 1; }
  });
  assert.equal(kills, 0);
});

test('releasePort kills every distinct owner and verifies release', async () => {
  const queries = [[20, 10, 20], []];
  const killed = [];
  await releasePort(3080, {
    queryOwners: async () => queries.shift(),
    killTree: async (pid) => killed.push(pid)
  });
  assert.deepEqual(killed, [20, 10]);
});

test('releasePort reports the PID when termination fails', async () => {
  await assert.rejects(
    releasePort(3080, {
      queryOwners: async () => [88],
      killTree: async () => { throw new Error('Access denied'); }
    }),
    /PID 88.*Access denied/
  );
});

test('releasePort fails when owners remain after cleanup', async () => {
  const queries = [[88], [99]];
  await assert.rejects(
    releasePort(3080, {
      queryOwners: async () => queries.shift(),
      killTree: async () => {}
    }),
    /port 3080.*PID: 99/i
  );
});
