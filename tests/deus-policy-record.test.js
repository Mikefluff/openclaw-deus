const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const {
  createDeusWorkspaceFixtureSync,
} = require("./helpers/deus-workspace-fixture");
const { getWorkspaceDateContext } = require("../src/workspace/workspace-date-context");
const { readWorkspaceActivityLogEntries } = require("../src/deus/deus-activity-log");
const { main } = require("../scripts/deus-policy-record");

test("deus-policy-record appends a structured policy event to the canonical daily log", async (t) => {
  const workspaceRoot = createDeusWorkspaceFixtureSync();
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  const result = await main({
    argv: [
      JSON.stringify({
        kind: "action_outcome",
        success: true,
        actionType: "repo_mutation",
        target: "ROADMAP.md",
        notes: "Roadmap update landed cleanly",
      }),
    ],
    workspaceRoot,
    silent: true,
  });

  const { today } = getWorkspaceDateContext();
  const entries = readWorkspaceActivityLogEntries({
    workspaceRoot,
    dayKey: today,
  });

  assert.equal(result.entry.type, "action_outcome");
  assert.equal(path.basename(result.logFile), `${today}.jsonl`);
  assert.equal(entries.length >= 1, true);
  assert.equal(entries.at(-1).type, "action_outcome");
  assert.equal(entries.at(-1).context.actionType, "repo_mutation");
  assert.equal(entries.at(-1).context.success, true);
});
