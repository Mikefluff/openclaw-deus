"use strict";

const { BELIEF_DECAY_PROFILE_FIELD_NAMES } = require("./belief-policy");
const { annotateBeliefWithGovernanceProfile } = require("./belief-governance-annotate");
const { getBeliefGovernanceDirective } = require("./belief-governance-directives");

function repairBeliefWithGovernanceDirective(
  belief,
  { now = new Date() } = {},
) {
  const directive = getBeliefGovernanceDirective(belief.belief_id);
  if (!directive?.critical) {
    return { belief, repaired: false };
  }

  const repairedBelief = annotateBeliefWithGovernanceProfile(belief);
  const oldConfidence = repairedBelief.confidence;
  const oldStatus = repairedBelief.status || "active";
  const targetConfidence = directive.repair_target;
  const targetStatus = directive.repair_status || "active";
  let repaired = false;

  if (
    typeof targetConfidence === "number" &&
    Number.isFinite(targetConfidence) &&
    repairedBelief.confidence < targetConfidence
  ) {
    repairedBelief.confidence = targetConfidence;
    repaired = true;
  }

  if (repairedBelief.status !== targetStatus) {
    repairedBelief.status = targetStatus;
    repaired = true;
  }

  if (!repaired) {
    return { belief: repairedBelief, repaired: false };
  }

  repairedBelief.timestamp_updated = now.toISOString();
  repairedBelief.drift_history = repairedBelief.drift_history || [];
  repairedBelief.drift_history.push({
    timestamp: now.toISOString(),
    old_confidence: oldConfidence,
    new_confidence: repairedBelief.confidence,
    old_status: oldStatus,
    new_status: repairedBelief.status,
    reason: "governance_migration_repair",
    belief_class:
      repairedBelief[BELIEF_DECAY_PROFILE_FIELD_NAMES.beliefClass] || null,
  });

  return { belief: repairedBelief, repaired: true };
}

function repairBeliefCollection(beliefs, options = {}) {
  let repairedCount = 0;
  const repairedBeliefs = beliefs.map((belief) => {
    const result = repairBeliefWithGovernanceDirective(belief, options);
    if (result.repaired) {
      repairedCount += 1;
    }

    return result.belief;
  });

  return { beliefs: repairedBeliefs, repairedCount };
}

module.exports = {
  repairBeliefCollection,
  repairBeliefWithGovernanceDirective,
};
