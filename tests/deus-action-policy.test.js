const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeWorldModel } = require("../src/world-model/world-model-schema");
const { evaluateAction } = require("../src/policy/deus-action-policy");

function createWorldModel(overrides = {}) {
  return normalizeWorldModel({
    generated_at: "2026-03-21T00:00:00.000Z",
    workspace_day: "2026-03-21",
    confidence: 0.92,
    self_model: {
      agency_level: "L2+",
      invariants: [{ id: "I1", content: "Epistemic honesty", confidence: 1 }],
      goals: [{ id: "G1", content: "Support the human", confidence: 0.8 }],
      review_pressure: {},
      active_limitations: [],
    },
    human_model: {
      preferences: ["structured output"],
      constraints: [],
      active_requests: ["ship the advisory layer"],
    },
    workspace_model: {
      active_project: "deus",
      mode: "working",
      status: "working",
      repo_dirty: false,
      repo_changes: 0,
      memory_freshness_days: 0,
      introspection_date: "2026-03-21",
      recurring_patterns: [],
      next_step: "run tests",
      waiting_for: null,
      follow_through_required: "no",
    },
    environment_model: {
      waiting_conditions: [],
      dependencies: ["cloudflare", "openclaw"],
      open_tensions: [],
      external_systems: [],
    },
    action_priors: {
      hard_blocks: [],
      preferred_modes: ["observe", "prepare_conditions"],
      active_risks: [],
    },
    sources: {},
    ...overrides,
  });
}

test("coordinator returns blocked when human confirmation is required and missing", async () => {
  const evaluation = await evaluateAction(
    {
      goal: "Send operator update",
      actionType: "external_message",
      target: "operator",
    },
    {
      worldModel: createWorldModel(),
      now: "2026-03-21T02:00:00.000Z",
    },
  );

  assert.equal(evaluation.decision, "blocked");
  assert.equal(evaluation.coordinatorDecision, "blocked");
  assert.equal(evaluation.shouldActNow, false);
  assert.deepEqual(evaluation.blockers, ["missing_human_confirmation"]);
  assert.equal(evaluation.dissensus.decision, "pause_l2");
  assert.equal(evaluation.dissensus.trigger_type, "missing_human_confirmation");
  assert.equal(evaluation.requiresDissensusOverride, true);
  assert.equal(
    evaluation.recommendedNextStep,
    "request explicit human confirmation before acting",
  );
});

test("coordinator returns prepare_conditions for medium ripeness deploy work with partial readiness", async () => {
  const evaluation = await evaluateAction(
    {
      goal: "Deploy example project",
      actionType: "deploy",
      target: "projects/example-project",
      confirmedByHuman: true,
      dependencies: ["cloudflare", "dokploy"],
    },
    {
      worldModel: createWorldModel({
        workspace_model: {
          active_project: "deus",
          mode: "working",
          status: "waiting",
          repo_dirty: true,
          repo_changes: 2,
          memory_freshness_days: 0,
          introspection_date: "2026-03-21",
          recurring_patterns: [],
          next_step: "wait for deploy window",
          waiting_for: "deploy window",
          follow_through_required: "yes",
        },
        action_priors: {
          hard_blocks: ["waiting_for_condition"],
          preferred_modes: ["prepare_conditions", "wait"],
          active_risks: ["repo_dirty"],
        },
      }),
      now: "2026-03-21T02:00:00.000Z",
    },
  );

  assert.equal(evaluation.decision, "prepare_conditions");
  assert.equal(evaluation.recommendedMode, "prepare_conditions");
  assert.match(
    evaluation.recommendedNextStep,
    /prepare dependency readiness for dokploy/,
  );
  assert.equal(evaluation.cost.band, "medium");
});

test("coordinator returns direct_act for high-ripeness low-cost internal analysis", async () => {
  const evaluation = await evaluateAction(
    {
      goal: "Inspect DEUS health output",
      actionType: "analyze",
      target: "deus:health",
    },
    {
      worldModel: createWorldModel(),
      now: "2026-03-21T02:00:00.000Z",
    },
  );

  assert.equal(evaluation.decision, "direct_act");
  assert.equal(evaluation.coordinatorDecision, "direct_act");
  assert.equal(evaluation.shouldActNow, true);
  assert.equal(evaluation.dissensus.decision, "allow");
  assert.equal(evaluation.recommendedNextStep, null);
  assert.equal(evaluation.worldModelRef.source, "provided");
});

test("coordinator carries a dissensus signal for confirmed belief mutations without forcing a second block", async () => {
  const evaluation = await evaluateAction(
    {
      goal: "Refresh durable belief content",
      actionType: "belief_mutation",
      target: "beliefs/core.jsonl",
      confirmedByHuman: true,
    },
    {
      worldModel: createWorldModel(),
      now: "2026-03-21T02:00:00.000Z",
    },
  );

  assert.equal(evaluation.decision, "direct_act");
  assert.equal(evaluation.coordinatorDecision, "direct_act");
  assert.equal(evaluation.dissensus.decision, "signal_l1");
  assert.equal(evaluation.dissensus.trigger_type, "durable_belief_mutation");
  assert.equal(evaluation.requiresDissensusOverride, false);
});

test("coordinator returns wait when conditions are not ready but the action frame is still coherent", async () => {
  const evaluation = await evaluateAction(
    {
      actionType: "analyze",
      target: "deus:health",
      dependencies: ["dokploy"],
    },
    {
      worldModel: createWorldModel({
        generated_at: "2026-03-19T00:00:00.000Z",
        confidence: 0.18,
        workspace_model: {
          active_project: "deus",
          mode: "working",
          status: "waiting",
          repo_dirty: true,
          repo_changes: 2,
          memory_freshness_days: 5,
          introspection_date: null,
          recurring_patterns: [],
          next_step: "wait for deploy window",
          waiting_for: "deploy window",
          follow_through_required: "yes",
        },
        action_priors: {
          hard_blocks: ["waiting_for_condition"],
          preferred_modes: ["prepare_conditions", "wait"],
          active_risks: ["repo_dirty", "work_block_waiting"],
        },
      }),
      now: "2026-03-21T12:00:00.000Z",
    },
  );

  assert.equal(evaluation.decision, "wait");
  assert.match(evaluation.recommendedNextStep, /wait for deploy window/);
  assert.match(evaluation.decisionSummary, /stable enough to wait/);
});

test("coordinator returns observe when readiness is low without a specific waiting gate", async () => {
  const evaluation = await evaluateAction(
    {
      actionType: "analyze",
      target: "deus:health",
      dependencies: ["dokploy", "cloudflare"],
    },
    {
      worldModel: createWorldModel({
        generated_at: "2026-03-19T00:00:00.000Z",
        confidence: 0,
        workspace_model: {
          active_project: "deus",
          mode: "working",
          status: "working",
          repo_dirty: true,
          repo_changes: 3,
          memory_freshness_days: 6,
          introspection_date: null,
          recurring_patterns: [],
          next_step: "gather context",
          waiting_for: null,
          follow_through_required: "no",
        },
        environment_model: {
          waiting_conditions: [],
          dependencies: [],
          open_tensions: [],
          external_systems: [],
        },
        action_priors: {
          hard_blocks: [],
          preferred_modes: ["observe"],
          active_risks: ["repo_dirty", "uncertain_context", "low_signal"],
        },
      }),
      now: "2026-03-21T12:00:00.000Z",
    },
  );

  assert.equal(evaluation.decision, "observe");
  assert.match(evaluation.recommendedNextStep, /gather context and clarify/);
  assert.match(evaluation.decisionSummary, /observation/);
});

test("coordinator returns reframe when the action type is unknown or structurally misaligned", async () => {
  const evaluation = await evaluateAction(
    {
      actionType: "invent-new-mode",
      goal: "",
      target: "mystery",
    },
    {
      worldModel: createWorldModel(),
      now: "2026-03-21T02:00:00.000Z",
    },
  );

  assert.equal(evaluation.decision, "reframe");
  assert.match(evaluation.recommendedNextStep, /reframe unknown/);
  assert.match(evaluation.decisionSummary, /reframed/);
});
