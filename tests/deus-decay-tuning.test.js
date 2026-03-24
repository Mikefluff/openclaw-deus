const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  applyBoundedDecayTuningFromPacket,
  buildBoundedDecayTuningProposal,
} = require("../src/policy/deus-decay-tuning");

function createPacket() {
  return {
    reportDate: "2026-03-22",
    followup: {
      decision: "repair",
      decayPolicy: {
        tuningSuggested: true,
        tuningCandidates: [
          {
            kind: "review_floor_binding",
            scope: "class",
            beliefClass: "self_model",
            dominantDecayMode: "slow",
            suggestedDecayMode: "no_decay",
            affectedBeliefCount: 2,
            reason:
              "2 active beliefs are pinned to the class floor under a decaying mode",
          },
        ],
      },
    },
  };
}

test("bounded decay tuning builds a class-level proposal from the follow-up packet", () => {
  const result = buildBoundedDecayTuningProposal(createPacket());

  assert.equal(result.eligible, true);
  assert.deepEqual(result.proposal, {
    beliefClass: "self_model",
    updates: {
      decay_mode: "no_decay",
    },
    reason: "introspection_decay_tuning:review_floor_binding",
    reportDate: "2026-03-22",
    sourceCandidate: {
      kind: "review_floor_binding",
      scope: "class",
      beliefClass: "self_model",
      dominantDecayMode: "slow",
      suggestedDecayMode: "no_decay",
      affectedBeliefCount: 2,
      reason:
        "2 active beliefs are pinned to the class floor under a decaying mode",
    },
  });
});

test("bounded decay tuning writes exactly one override and becomes idempotent", (t) => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "deus-decay-tuning-"),
  );
  const filePath = path.join(tempDir, "decay-policy.overrides.json");
  t.after(() => fs.rmSync(tempDir, { recursive: true, force: true }));

  const first = applyBoundedDecayTuningFromPacket(createPacket(), {
    filePath,
    actor: "test",
    now: new Date("2026-03-22T09:10:00.000Z"),
  });
  assert.equal(first.applied, true);
  assert.equal(first.nextProfile.decay_mode, "no_decay");

  const saved = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.equal(saved.classes.self_model.decay_mode, "no_decay");
  assert.equal(saved.history.length, 1);

  const second = applyBoundedDecayTuningFromPacket(createPacket(), {
    filePath,
    actor: "test",
    now: new Date("2026-03-22T09:11:00.000Z"),
  });
  assert.equal(second.applied, false);
  assert.equal(second.reason, "suggested_decay_mode_already_applied");
});
