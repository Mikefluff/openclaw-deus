const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");

const {
  detectRecurringPolicyPatterns,
  readRecentPolicyFeedback,
  recordActionEvaluation,
  recordActionOutcome,
  recordWorldModelRefresh,
} = require("../src/policy/deus-policy-feedback");
const { readActivityLogEntries } = require("../src/deus/deus-activity-log");
const {
  loadDissensusOpenCasesArtifact,
  readDissensusEvents,
} = require("../src/policy/deus-dissensus-runtime");
const {
  createDeusWorkspaceFixtureSync,
} = require("./helpers/deus-workspace-fixture");

test("policy feedback helpers write structured daily activity log entries", (t) => {
  const workspaceRoot = createDeusWorkspaceFixtureSync();
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  recordWorldModelRefresh(
    {
      worldModel: {
        workspaceDay: "2026-03-18",
        confidence: 0.83,
        activeProject: "deus",
        openLoops: 2,
        activeRisks: 1,
        hardBlocks: ["waiting_for_condition"],
        preferredModes: ["wait"],
      },
      actionPolicy: {
        decision: "wait",
        recommendedMode: "wait",
      },
    },
    {
      workspaceRoot,
      timestamp: "2026-03-18T09:00:00.000Z",
      echo: false,
    },
  );
  recordActionEvaluation(
    {
      intent: {
        goal: "Send operator update",
        action_type: "external_message",
        target: "operator",
      },
      decision: "blocked",
      recommendedMode: "blocked",
      recommendedNextStep: "request explicit human confirmation before acting",
      ripeness: {
        score: 0.41,
        class: "blocked",
      },
      cost: {
        band: "medium",
        total: 0.44,
      },
      blockers: ["missing_human_confirmation"],
      missingPreconditions: [],
      requiresHumanConfirmation: true,
      dissensus: {
        decision: "pause_l2",
        level: "l2",
        trigger_type: "missing_human_confirmation",
        target_class: "third_party",
        override_allowed: true,
        override_token_kind: "human_confirmation",
        reason:
          "explicit human confirmation is required before this high-impact action",
      },
      requiresDissensusOverride: true,
      worldModelRef: {
        confidence: 0.83,
        source: "live_build",
      },
    },
    {
      workspaceRoot,
      timestamp: "2026-03-18T09:05:00.000Z",
      echo: false,
    },
  );
  recordActionOutcome(
    {
      actionType: "external_message",
      target: "operator",
      success: false,
      maintenanceTailObserved: "high",
      followupRequired: true,
      notes: "Human confirmation missing",
      blockers: ["missing_human_confirmation"],
    },
    {
      workspaceRoot,
      timestamp: "2026-03-18T09:06:00.000Z",
      echo: false,
    },
  );

  const entries = readActivityLogEntries("2026-03-18", {
    workspaceRoot,
  }).filter((entry) =>
    ["world_model_refresh", "action_evaluation", "action_outcome"].includes(
      entry.type,
    ),
  );
  assert.equal(entries.length, 3);
  assert.equal(entries[0].type, "world_model_refresh");
  assert.equal(entries[0].context.policyEventType, "world_model_refresh");
  assert.equal(entries[1].type, "action_evaluation");
  assert.equal(entries[1].context.policyEventType, "action_evaluation");
  assert.equal(entries[1].context.decision, "blocked");
  assert.deepEqual(entries[1].context.blockers, ["missing_human_confirmation"]);
  assert.equal(entries[1].context.dissensusDecision, "pause_l2");
  assert.equal(entries[1].context.dissensusLevel, "l2");
  assert.equal(
    entries[1].context.dissensusTrigger,
    "missing_human_confirmation",
  );
  assert.equal(entries[2].type, "action_outcome");
  assert.equal(entries[2].context.policyEventType, "action_outcome");
  assert.equal(entries[2].context.success, false);
  assert.equal(entries[2].context.maintenanceTailObserved, "high");

  const dissensusEvents = readDissensusEvents({
    workspaceRoot,
    dayKey: "2026-03-18",
  });
  const openCases = loadDissensusOpenCasesArtifact({ workspaceRoot });
  assert.equal(dissensusEvents.length, 1);
  assert.equal(dissensusEvents[0].decision, "pause_l2");
  assert.equal(openCases.cases.length, 1);
  assert.equal(openCases.cases[0].status, "open");

  const feedback = readRecentPolicyFeedback({
    workspaceRoot,
    limitDays: 1,
  });
  assert.equal(feedback.summary.totalEvents, 3);
  assert.equal(feedback.summary.worldModelRefreshes, 1);
  assert.equal(feedback.summary.evaluations, 1);
  assert.equal(feedback.summary.outcomes, 1);
  assert.equal(feedback.summary.failedOutcomes, 1);
  assert.equal(feedback.summary.highMaintenanceOutcomes, 1);
  assert.deepEqual(feedback.summary.topBlockers, [
    {
      blocker: "missing_human_confirmation",
      count: 2,
    },
  ]);
  assert.deepEqual(feedback.summary.highCostActionTypes, [
    {
      actionType: "external_message",
      count: 1,
    },
  ]);
});

test("policy feedback pattern detection finds recurring blockers and maintenance friction", (t) => {
  const workspaceRoot = createDeusWorkspaceFixtureSync();
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  recordActionEvaluation(
    {
      intent: {
        goal: "Send operator update",
        action_type: "external_message",
        target: "operator",
      },
      decision: "blocked",
      recommendedMode: "blocked",
      ripeness: { score: 0.4, class: "blocked" },
      cost: { band: "medium", total: 0.44 },
      blockers: ["missing_human_confirmation"],
      missingPreconditions: [],
      dissensus: {
        decision: "pause_l2",
        level: "l2",
        trigger_type: "missing_human_confirmation",
        target_class: "third_party",
        override_allowed: true,
        override_token_kind: "human_confirmation",
        reason:
          "explicit human confirmation is required before this high-impact action",
      },
    },
    {
      workspaceRoot,
      timestamp: "2026-03-17T09:00:00.000Z",
      echo: false,
    },
  );
  recordActionEvaluation(
    {
      intent: {
        goal: "Send operator update",
        action_type: "external_message",
        target: "operator",
      },
      decision: "blocked",
      recommendedMode: "blocked",
      ripeness: { score: 0.39, class: "blocked" },
      cost: { band: "medium", total: 0.43 },
      blockers: ["missing_human_confirmation"],
      missingPreconditions: [],
      dissensus: {
        decision: "pause_l2",
        level: "l2",
        trigger_type: "missing_human_confirmation",
        target_class: "third_party",
        override_allowed: true,
        override_token_kind: "human_confirmation",
        reason:
          "explicit human confirmation is required before this high-impact action",
      },
    },
    {
      workspaceRoot,
      timestamp: "2026-03-18T09:00:00.000Z",
      echo: false,
    },
  );
  recordActionEvaluation(
    {
      intent: {
        goal: "Deploy example project",
        action_type: "deploy",
        target: "projects/example-project",
      },
      decision: "prepare_conditions",
      recommendedMode: "prepare_conditions",
      ripeness: { score: 0.58, class: "prepare" },
      cost: { band: "high", total: 0.7 },
      blockers: [],
      missingPreconditions: ["dependency_not_ready:dokploy"],
    },
    {
      workspaceRoot,
      timestamp: "2026-03-18T10:00:00.000Z",
      echo: false,
    },
  );
  recordActionEvaluation(
    {
      intent: {
        goal: "Deploy example project",
        action_type: "deploy",
        target: "projects/example-project",
      },
      decision: "prepare_conditions",
      recommendedMode: "prepare_conditions",
      ripeness: { score: 0.57, class: "prepare" },
      cost: { band: "high", total: 0.69 },
      blockers: [],
      missingPreconditions: ["dependency_not_ready:cloudflare"],
    },
    {
      workspaceRoot,
      timestamp: "2026-03-19T10:00:00.000Z",
      echo: false,
    },
  );
  recordActionOutcome(
    {
      actionType: "deploy",
      target: "projects/example-project",
      success: true,
      maintenanceTailObserved: "high",
      followupRequired: true,
    },
    {
      workspaceRoot,
      timestamp: "2026-03-18T11:00:00.000Z",
      echo: false,
    },
  );
  recordActionOutcome(
    {
      actionType: "deploy",
      target: "projects/example-project",
      success: true,
      maintenanceTailObserved: "high",
      followupRequired: true,
    },
    {
      workspaceRoot,
      timestamp: "2026-03-19T11:00:00.000Z",
      echo: false,
    },
  );

  const feedback = readRecentPolicyFeedback({
    workspaceRoot,
    limitDays: 7,
  });
  const patterns = detectRecurringPolicyPatterns(feedback.entries, {
    minCount: 2,
  });

  assert.deepEqual(patterns.map((pattern) => pattern.name).sort(), [
    "confirmation_gating_pressure",
    "dependency_readiness_gaps",
    "high_maintenance_action_tail",
  ]);
  assert.equal(
    patterns.find((pattern) => pattern.name === "confirmation_gating_pressure")
      .recurrence,
    2,
  );
  assert.deepEqual(
    patterns.find((pattern) => pattern.name === "dependency_readiness_gaps")
      .evidenceSources,
    ["logs/2026-03-18.jsonl", "logs/2026-03-19.jsonl"],
  );
});
