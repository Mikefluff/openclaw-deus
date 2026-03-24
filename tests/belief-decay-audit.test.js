const test = require("node:test");
const assert = require("node:assert/strict");

const { buildDecayPolicyAudit } = require("../src/beliefs/belief-decay-audit");

test("decay audit only suggests tuning for active decaying floor pressure", () => {
  const audit = buildDecayPolicyAudit([
    {
      belief_id: "I1",
      confidence: 1,
      status: "active",
      source_type: "axiom",
      belief_class: "axiom",
      decay_mode: "no_decay",
      confidence_floor: 1,
      review_threshold: 1,
      archivable: false,
    },
    {
      belief_id: "G1",
      confidence: 0.9,
      status: "active",
      source_type: "inference",
      belief_class: "self_model",
      decay_mode: "slow",
      confidence_floor: 0.9,
      review_threshold: 0.9,
      archivable: false,
    },
    {
      belief_id: "G2",
      confidence: 0.9,
      status: "active",
      source_type: "inference",
      belief_class: "self_model",
      decay_mode: "slow",
      confidence_floor: 0.9,
      review_threshold: 0.9,
      archivable: false,
    },
    {
      belief_id: "M2",
      confidence: 0.2,
      status: "archived",
      source_type: "external",
      belief_class: "hypothesis",
      decay_mode: "normal",
      confidence_floor: 0.2,
      review_threshold: 0.55,
      archivable: true,
    },
    {
      belief_id: "M3",
      confidence: 0.2,
      status: "archived",
      source_type: "external",
      belief_class: "hypothesis",
      decay_mode: "normal",
      confidence_floor: 0.2,
      review_threshold: 0.55,
      archivable: true,
    },
  ]);

  assert.deepEqual(audit.activeFloorPressure.map((entry) => entry.beliefId), [
    "G1",
    "G2",
  ]);
  assert.deepEqual(audit.criticalAtRisk.map((entry) => entry.beliefId), [
    "G1",
    "G2",
  ]);
  assert.deepEqual(audit.tuningCandidates, [
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
  ]);
});

test("decay audit flags archived non-archivable beliefs as contract breaches", () => {
  const audit = buildDecayPolicyAudit([
    {
      belief_id: "S1",
      confidence: 0.9,
      status: "archived",
      source_type: "self",
      belief_class: "self_model",
      decay_mode: "slow",
      confidence_floor: 0.85,
      review_threshold: 0.9,
      archivable: false,
    },
  ]);

  assert.deepEqual(audit.archivedNonArchivable, [
    {
      beliefId: "S1",
      beliefClass: "self_model",
      confidence: 0.9,
      status: "archived",
    },
  ]);
  assert.equal(audit.tuningSuggested, false);
});
