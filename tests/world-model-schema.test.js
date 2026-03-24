const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getWorldModelAgeHours,
  isWorldModelFresh,
  normalizeWorldModel,
} = require("../src/world-model/world-model-schema");

test("normalizeWorldModel fills the canonical world-model shape", () => {
  const model = normalizeWorldModel({
    generated_at: "2026-03-21T00:00:00.000Z",
    confidence: 2,
    self_model: {
      agency_level: "L3",
      invariants: [{ id: "I1", content: "Epistemic honesty", confidence: 1 }],
    },
    human_model: {
      preferences: ["structured output", "structured output"],
    },
  });

  assert.equal(model.version, 1);
  assert.equal(model.confidence, 1);
  assert.equal(model.self_model.agency_level, "L3");
  assert.equal(model.self_model.invariants.length, 1);
  assert.deepEqual(model.human_model.preferences, ["structured output"]);
  assert.equal(model.workspace_model.active_project, null);
});

test("world-model freshness uses generated_at against the policy window", () => {
  const model = normalizeWorldModel({
    generated_at: "2026-03-21T00:00:00.000Z",
  });

  assert.equal(getWorldModelAgeHours(model, "2026-03-21T06:00:00.000Z"), 6);
  assert.equal(isWorldModelFresh(model, "2026-03-21T06:00:00.000Z"), true);
  assert.equal(isWorldModelFresh(model, "2026-03-22T00:30:00.000Z"), false);
});
