const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const {
  readActivityLogEntries,
} = require("../src/deus/deus-activity-log");
const {
  loadDissensusOpenCasesArtifact,
  readDissensusEvents,
  recordDissensusEvaluation,
  recordDissensusOverride,
} = require("../src/policy/deus-dissensus-runtime");
const {
  createDeusWorkspaceFixtureSync,
} = require("./helpers/deus-workspace-fixture");

test("recordDissensusEvaluation writes event history and opens an L2 case", (t) => {
  const workspaceRoot = createDeusWorkspaceFixtureSync();
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  const result = recordDissensusEvaluation(
    {
      dissensus: {
        evaluated_at: "2026-03-23T09:10:00.000Z",
        decision: "pause_l2",
        level: "l2",
        trigger_type: "missing_human_confirmation",
        action_type: "external_message",
        target: "operator",
        target_class: "third_party",
        override_allowed: true,
        override_token_kind: "human_confirmation",
        reason: "explicit human confirmation is required before this high-impact action",
      },
    },
    {
      workspaceRoot,
    },
  );

  const events = readDissensusEvents({
    workspaceRoot,
    dayKey: "2026-03-23",
  });
  const casesArtifact = loadDissensusOpenCasesArtifact({ workspaceRoot });
  const activityEntries = readActivityLogEntries("2026-03-23", {
    workspaceRoot,
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].decision, "pause_l2");
  assert.equal(casesArtifact.cases.length, 1);
  assert.equal(casesArtifact.cases[0].status, "open");
  assert.equal(casesArtifact.cases[0].override_token_kind, "human_confirmation");
  assert.equal(result.decision.decision, "pause_l2");
  assert.equal(activityEntries.length, 0);
});

test("allow decision closes a matching open case", (t) => {
  const workspaceRoot = createDeusWorkspaceFixtureSync();
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  recordDissensusEvaluation(
    {
      dissensus: {
        evaluated_at: "2026-03-23T09:10:00.000Z",
        decision: "pause_l2",
        level: "l2",
        trigger_type: "missing_human_confirmation",
        action_type: "external_message",
        target: "operator",
        target_class: "third_party",
        override_allowed: true,
        override_token_kind: "human_confirmation",
        reason: "explicit human confirmation is required before this high-impact action",
      },
    },
    { workspaceRoot },
  );
  recordDissensusEvaluation(
    {
      dissensus: {
        evaluated_at: "2026-03-23T09:11:00.000Z",
        decision: "allow",
        level: "none",
        trigger_type: "missing_human_confirmation",
        action_type: "external_message",
        target: "operator",
        target_class: "third_party",
        override_allowed: false,
        override_token_kind: "none",
        reason: "confirmation is now present",
      },
    },
    { workspaceRoot },
  );

  const casesArtifact = loadDissensusOpenCasesArtifact({ workspaceRoot });
  assert.equal(casesArtifact.cases.length, 0);
});

test("recordDissensusOverride appends a structured override entry", (t) => {
  const workspaceRoot = createDeusWorkspaceFixtureSync();
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  const result = recordDissensusOverride(
    {
      caseId: "case-1",
      decisionId: "decision-1",
      overrideTokenKind: "human_confirmation",
      actor: "human",
      reason: "User explicitly approved the action",
      timestamp: "2026-03-23T09:20:00.000Z",
    },
    {
      workspaceRoot,
    },
  );

  const content = fs.readFileSync(result.filePath, "utf8").trim();
  const entries = content.split("\n").map((line) => JSON.parse(line));

  assert.equal(entries.length, 1);
  assert.equal(entries[0].case_id, "case-1");
  assert.equal(entries[0].decision_id, "decision-1");
  assert.equal(entries[0].override_token_kind, "human_confirmation");
});
