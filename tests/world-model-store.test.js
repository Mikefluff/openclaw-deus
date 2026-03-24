const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { createDeusWorkspaceFixtureSync } = require("./helpers/deus-workspace-fixture");
const {
  getDailyWorldModelPath,
  getLatestWorldModelPath,
  readLatestWorldModel,
  writeWorldModel,
} = require("../src/world-model/world-model-store");

test("world-model store writes and reads latest and daily snapshots", (t) => {
  const workspaceRoot = createDeusWorkspaceFixtureSync();
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  const result = writeWorldModel(
    {
      generated_at: "2026-03-21T00:00:00.000Z",
      workspace_day: "2026-03-21",
      confidence: 0.81,
    },
    { workspaceRoot },
  );

  assert.equal(result.latestPath, getLatestWorldModelPath({ workspaceRoot }));
  assert.equal(
    result.dailyPath,
    getDailyWorldModelPath("2026-03-21", { workspaceRoot }),
  );
  assert.equal(fs.existsSync(result.latestPath), true);
  assert.equal(fs.existsSync(result.dailyPath), true);

  const stored = readLatestWorldModel({ workspaceRoot });
  assert.equal(stored.workspace_day, "2026-03-21");
  assert.equal(stored.confidence, 0.81);
  assert.equal(
    path.basename(result.latestPath),
    "world-model.latest.json",
  );
});
