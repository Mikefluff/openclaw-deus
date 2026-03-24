const test = require("node:test");
const assert = require("node:assert/strict");

const {
  normalizeWorldModel,
} = require("../src/world-model/world-model-schema");
const { evaluateDissensus } = require("../src/policy/deus-dissensus-engine");

function createWorldModel(overrides = {}) {
  return normalizeWorldModel({
    generated_at: "2026-03-23T00:00:00.000Z",
    workspace_day: "2026-03-23",
    confidence: 0.92,
    self_model: {
      agency_level: "L2+",
      invariants: [
        { id: "I1", content: "Epistemic honesty", confidence: 1 },
        { id: "I2", content: "Non-maleficence", confidence: 1 },
        { id: "I3", content: "Autonomy preservation", confidence: 1 },
        { id: "I4", content: "Transparency", confidence: 1 },
      ],
      goals: [{ id: "G1", content: "Support the human", confidence: 0.9 }],
      review_pressure: {},
      active_limitations: [],
    },
    human_model: {
      preferences: ["structured output"],
      constraints: [],
      active_requests: [],
    },
    workspace_model: {
      active_project: "deus",
      mode: "working",
      status: "working",
      repo_dirty: false,
      repo_changes: 0,
      memory_freshness_days: 0,
      introspection_date: "2026-03-23",
      recurring_patterns: [],
      next_step: "inspect",
      waiting_for: null,
      follow_through_required: "no",
    },
    environment_model: {
      waiting_conditions: [],
      dependencies: ["openclaw"],
      open_tensions: [],
      external_systems: [],
    },
    action_priors: {
      hard_blocks: [],
      preferred_modes: ["observe"],
      active_risks: [],
    },
    sources: {},
    ...overrides,
  });
}

test("dissensus pauses when explicit human confirmation is missing", () => {
  const decision = evaluateDissensus(
    {
      goal: "Send message",
      actionType: "external_message",
      target: "operator",
    },
    createWorldModel(),
    {
      now: "2026-03-23T09:00:00.000Z",
    },
  );

  assert.equal(decision.decision, "pause_l2");
  assert.equal(decision.level, "l2");
  assert.equal(decision.trigger_type, "missing_human_confirmation");
  assert.equal(decision.override_allowed, true);
  assert.equal(decision.override_token_kind, "human_confirmation");
  assert.equal(decision.requires_case, true);
});

test("dissensus signals identity-critical mutations after confirmation is already present", () => {
  const decision = evaluateDissensus(
    {
      goal: "Update DEUS self-model",
      actionType: "repo_mutation",
      target: "DEUS.md",
      confirmedByHuman: true,
    },
    createWorldModel(),
    {
      now: "2026-03-23T09:00:00.000Z",
    },
  );

  assert.equal(decision.decision, "signal_l1");
  assert.equal(decision.level, "l1");
  assert.equal(decision.trigger_type, "identity_critical_mutation");
  assert.equal(decision.target_class, "identity_root");
  assert.equal(decision.override_allowed, false);
});

test("dissensus refuses when the world model carries an invariant conflict hard block", () => {
  const decision = evaluateDissensus(
    {
      goal: "Perform conflicting action",
      actionType: "repo_mutation",
      target: "src/deus/deus-health.js",
      confirmedByHuman: true,
    },
    createWorldModel({
      action_priors: {
        hard_blocks: ["invariant_conflict"],
        preferred_modes: ["wait"],
        active_risks: [],
      },
    }),
    {
      now: "2026-03-23T09:00:00.000Z",
    },
  );

  assert.equal(decision.decision, "refuse_l3");
  assert.equal(decision.level, "l3");
  assert.equal(decision.trigger_type, "invariant_conflict");
  assert.equal(decision.override_allowed, false);
  assert.deepEqual(decision.invariant_refs, ["I1", "I2", "I3", "I4"]);
});

test("dissensus allows ordinary low-impact analysis", () => {
  const decision = evaluateDissensus(
    {
      goal: "Inspect health",
      actionType: "analyze",
      target: "deus:health",
    },
    createWorldModel(),
    {
      now: "2026-03-23T09:00:00.000Z",
    },
  );

  assert.equal(decision.decision, "allow");
  assert.equal(decision.level, "none");
  assert.equal(decision.trigger_type, "none");
  assert.equal(decision.requires_case, false);
});
