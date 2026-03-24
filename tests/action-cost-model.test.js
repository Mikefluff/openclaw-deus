const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeWorldModel } = require("../src/world-model/world-model-schema");
const {
  estimateActionCost,
  getCostBand,
} = require("../src/policy/action-cost-model");

function createWorldModel(overrides = {}) {
  return normalizeWorldModel({
    generated_at: "2026-03-21T00:00:00.000Z",
    workspace_day: "2026-03-21",
    confidence: 0.9,
    self_model: {
      agency_level: "L2+",
      invariants: [{ id: "I1", content: "Epistemic honesty", confidence: 1 }],
      goals: [],
      review_pressure: {},
      active_limitations: [],
    },
    human_model: {
      preferences: [],
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
      introspection_date: "2026-03-21",
      recurring_patterns: [],
      next_step: null,
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
      preferred_modes: ["observe"],
      active_risks: [],
    },
    sources: {},
    ...overrides,
  });
}

test("action cost stays low for low-impact internal analysis", () => {
  const result = estimateActionCost(
    {
      goal: "Inspect health output",
      actionType: "analyze",
      target: "health",
    },
    createWorldModel(),
  );

  assert.equal(result.band, "low");
  assert.equal(result.total < 0.4, true);
  assert.equal(result.breakdown.externality, 0);
});

test("action cost rises for high-impact deploy work on a dirty waiting workspace", () => {
  const result = estimateActionCost(
    {
      goal: "Deploy example project",
      actionType: "deploy",
      target: "projects/example-project",
      dependencies: ["cloudflare", "dokploy"],
    },
    createWorldModel({
      workspace_model: {
        active_project: "deus",
        mode: "working",
        status: "waiting",
        repo_dirty: true,
        repo_changes: 3,
        memory_freshness_days: 2,
        introspection_date: "2026-03-19",
        recurring_patterns: [],
        next_step: "wait for deploy window",
        waiting_for: "deploy window",
        follow_through_required: "yes",
      },
      environment_model: {
        waiting_conditions: ["deploy window"],
        dependencies: ["cloudflare"],
        open_tensions: ["governance-ambiguity", "follow-through-risk"],
        external_systems: ["projects_workspace"],
      },
      action_priors: {
        hard_blocks: ["waiting_for_condition"],
        preferred_modes: ["prepare_conditions", "wait"],
        active_risks: ["repo_dirty", "work_block_waiting"],
      },
    }),
  );

  assert.equal(result.band, "medium");
  assert.equal(result.breakdown.execution >= 0.65, true);
  assert.equal(result.breakdown.autonomy >= 0.4, true);
  assert.match(result.rationale.join(" "), /dirty repo/);
  assert.match(result.rationale.join(" "), /missing human confirmation/);
});

test("human confirmation lowers autonomy cost for external actions", () => {
  const baseWorldModel = createWorldModel();
  const withoutConfirmation = estimateActionCost(
    {
      goal: "Send operator update",
      actionType: "external_message",
      target: "operator",
    },
    baseWorldModel,
  );
  const withConfirmation = estimateActionCost(
    {
      goal: "Send operator update",
      actionType: "external_message",
      target: "operator",
      confirmedByHuman: true,
    },
    baseWorldModel,
  );

  assert.equal(
    withConfirmation.breakdown.autonomy <
      withoutConfirmation.breakdown.autonomy,
    true,
  );
});

test("cost band thresholds stay explicit", () => {
  assert.equal(getCostBand(0.39), "low");
  assert.equal(getCostBand(0.4), "medium");
  assert.equal(getCostBand(0.7), "high");
});
