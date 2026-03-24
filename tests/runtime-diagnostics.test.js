const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  resolveDiagnosticPaths,
  writeDiagnosticSnapshot,
} = require('../src/runtime/runtime-diagnostics');

test('runtime diagnostics keep the latest snapshot and prune history to the configured cap', async () => {
  const workspace = await fs.mkdtemp(
    path.join(os.tmpdir(), 'runtime-diagnostics-fixture-'),
  );

  for (let index = 0; index < 4; index += 1) {
    await writeDiagnosticSnapshot({
      workspaceRoot: workspace,
      name: 'rotation-test',
      payload: { index },
      historyLimit: 2,
      timestamp: new Date(Date.UTC(2026, 2, 18, 10, 0, index)),
    });
  }

  const diagnosticsPaths = resolveDiagnosticPaths('rotation-test', {
    workspaceRoot: workspace,
  });
  const latest = JSON.parse(
    await fs.readFile(diagnosticsPaths.latestPath, 'utf8'),
  );
  const historyEntries = (await fs.readdir(diagnosticsPaths.historyDir)).sort();

  assert.equal(latest.index, 3);
  assert.deepEqual(historyEntries, [
    '2026-03-18T10-00-02-000Z.json',
    '2026-03-18T10-00-03-000Z.json',
  ]);
});
