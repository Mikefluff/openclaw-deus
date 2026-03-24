const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  applyBoundedDecayOverridePatch,
  ensureDecayPolicyOverrideArtifact,
  loadDecayPolicyOverrideArtifact,
  resolveRuntimeBeliefDecayProfile,
  validateBoundedDecayOverridePatch,
} = require("../src/beliefs/belief-decay-overrides");

test("bounded decay override patch applies a one-step class retune", (t) => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "belief-decay-overrides-"),
  );
  const filePath = path.join(tempDir, "decay-policy.overrides.json");
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  ensureDecayPolicyOverrideArtifact({ filePath });

  const before = resolveRuntimeBeliefDecayProfile(
    {
      belief_id: "G1",
      source_type: "inference",
      belief_class: "self_model",
    },
    { filePath },
  );
  assert.equal(before.decay_mode, "slow");

  const result = applyBoundedDecayOverridePatch(
    {
      beliefClass: "self_model",
      updates: {
        decay_mode: "no_decay",
      },
      reason: "test_retune",
      reportDate: "2026-03-22",
    },
    {
      filePath,
      actor: "test",
      now: new Date("2026-03-22T09:00:00.000Z"),
    },
  );

  assert.equal(result.beliefClass, "self_model");
  assert.equal(result.previousProfile.decay_mode, "slow");
  assert.equal(result.nextProfile.decay_mode, "no_decay");

  const saved = loadDecayPolicyOverrideArtifact({ filePath });
  assert.equal(saved.classes.self_model.decay_mode, "no_decay");
  assert.equal(saved.history.length, 1);
});

test("bounded decay override guardrails reject forbidden classes and large jumps", (t) => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "belief-decay-overrides-"),
  );
  const filePath = path.join(tempDir, "decay-policy.overrides.json");
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  ensureDecayPolicyOverrideArtifact({ filePath });

  assert.throws(
    () =>
      validateBoundedDecayOverridePatch(
        {
          beliefClass: "axiom",
          updates: { decay_mode: "slow" },
        },
        { filePath },
      ),
    /forbidden/,
  );

  assert.throws(
    () =>
      validateBoundedDecayOverridePatch(
        {
          beliefClass: "operational",
          updates: { decay_mode: "no_decay" },
        },
        { filePath },
      ),
    /one decay mode step/,
  );
});
