const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeWorldModel } = require("../src/world-model/world-model-schema");
const { estimateRipeness } = require("../src/policy/ripeness-estimator");

function createWorldModel(overrides = {}) {
  return normalizeWorldModel({
    generated_at: "2026-03-21T00:00:00.000Z",
    workspace_day: "2026-03-21",
    confidence: 0.9,
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
      external_systems: ["projects_workspace"],
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

test("ripeness hard-blocks external action when human confirmation is missing", () => {
  const result = estimateRipeness(
    {
      goal: "Deploy example project",
      actionType: "deploy",
      target: "projects/example-project",
      dependencies: ["cloudflare"],
    },
    createWorldModel(),
    { now: "2026-03-21T02:00:00.000Z" },
  );

  assert.equal(result.class, "blocked");
  assert.deepEqual(result.blockers, ["missing_human_confirmation"]);
  assert.equal(result.factor_scores.authorization, 0);
  assert.match(result.rationale.join(" "), /human confirmation is missing/);
});

test("ripeness treats waiting-state friction separately from human confirmation and returns prepare when conditions are partial", () => {
  const result = estimateRipeness(
    {
      goal: "Deploy example project",
      actionType: "deploy",
      target: "projects/example-project",
      confirmedByHuman: true,
      dependencies: ["cloudflare", "dokploy"],
    },
    createWorldModel({
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
    { now: "2026-03-21T02:00:00.000Z" },
  );

  assert.equal(result.class, "prepare");
  assert.deepEqual(result.blockers, []);
  assert.match(
    result.missing_preconditions.join(" "),
    /dependency_not_ready:dokploy/,
  );
  assert.match(
    result.missing_preconditions.join(" "),
    /waiting_for_condition/,
  );
  assert.match(
    result.missing_preconditions.join(" "),
    /repo_dirty_for_high_impact_action/,
  );
});

test("ripeness returns act_now for a clear low-impact action on a fresh world model", () => {
  const result = estimateRipeness(
    {
      goal: "Inspect the latest world model",
      actionType: "analyze",
      target: "docs/introspection/world-model.latest.json",
      contextSources: ["world-model.latest.json"],
    },
    createWorldModel(),
    { now: "2026-03-21T02:00:00.000Z" },
  );

  assert.equal(result.class, "act_now");
  assert.deepEqual(result.blockers, []);
  assert.deepEqual(result.missing_preconditions, []);
  assert.equal(result.score >= 0.8, true);
});
