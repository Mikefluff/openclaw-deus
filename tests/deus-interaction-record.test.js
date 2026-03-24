const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");

const {
  readActivityLogEntries,
  resolveWorkspaceActivityLogPath,
} = require("../src/deus/deus-activity-log");
const { recordInteractionEvent } = require("../src/deus/deus-interaction-log");
const { main } = require("../scripts/deus-interaction-record");
const {
  createDeusWorkspaceFixtureSync,
} = require("./helpers/deus-workspace-fixture");

test("recordInteractionEvent appends salient interaction events to the canonical daily log", (t) => {
  const workspaceRoot = createDeusWorkspaceFixtureSync();
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  const result = recordInteractionEvent(
    {
      kind: "preference",
      content: "Я не люблю огурцы, не предлагай их в рецептах.",
      tags: ["food", "identity"],
    },
    {
      workspaceRoot,
      timestamp: "2026-03-19T09:00:00.000Z",
      echo: false,
    },
  );

  const entries = readActivityLogEntries("2026-03-19", {
    workspaceRoot,
  }).filter((entry) => entry.type === "interaction");

  assert.equal(result.recorded, true);
  assert.equal(result.skipped, false);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].description, result.entry.description);
  assert.equal(entries[0].context.interaction_event.kind, "preference");
  assert.equal(entries[0].context.interaction_capture.band, "review_signal");
  assert.equal(
    entries[0].context.interaction_capture.durableBeliefMutationAllowed,
    false,
  );
});

test("deus-interaction-record skips low-salience chatter without mutating daily logs", async (t) => {
  const workspaceRoot = createDeusWorkspaceFixtureSync();
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  const result = await main({
    argv: [
      JSON.stringify({
        kind: "question",
        content: "Что ты думаешь про огурцы?",
      }),
    ],
    workspaceRoot,
    timestamp: "2026-03-20T09:00:00.000Z",
    silent: true,
    echo: false,
  });

  const logPath = resolveWorkspaceActivityLogPath("2026-03-20", {
    workspaceRoot,
  });

  assert.equal(result.recorded, false);
  assert.equal(result.skipped, true);
  assert.equal(result.skipReason, "salience_below_log_threshold");
  assert.equal(fs.existsSync(logPath), false);
});
