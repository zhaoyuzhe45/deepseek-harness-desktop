const assert = require('node:assert/strict');
const test = require('node:test');

const { buildOwnerQueryScript, parseOwnerPids, releasePort } = require('../src/port-cleanup');

test('buildOwnerQueryScript separates the query assignment from JSON conversion', () => {
  const script = buildOwnerQueryScript(3080);
  assert.match(script, /-Unique\);\s*ConvertTo-Json/);
});

test('parseOwnerPids accepts JSON numbers and removes duplicates', () => {
  assert.deepEqual(parseOwnerPids('[42, 17, 42]'), [42, 17]);
  assert.deepEqual(parseOwnerPids(''), []);
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
