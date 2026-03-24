"use strict";

const {
  BELIEF_DECAY_PROFILE_FIELD_NAMES,
  resolveBeliefDecayProfile,
} = require("./belief-policy");
const { GOVERNANCE_DIRECTIVES } = require("./belief-governance-directives");

function annotateBeliefWithGovernanceProfile(belief) {
  const fields = BELIEF_DECAY_PROFILE_FIELD_NAMES;
  const normalizedBelief = { ...belief };
  delete normalizedBelief[fields.beliefClass];
  delete normalizedBelief[fields.decayMode];
  delete normalizedBelief[fields.confidenceFloor];
  delete normalizedBelief[fields.reviewThreshold];
  delete normalizedBelief[fields.archivable];
  delete normalizedBelief[fields.refreshStrategy];
  const resolved = resolveBeliefDecayProfile(normalizedBelief, {
    overrides: GOVERNANCE_DIRECTIVES,
  });

  return {
    ...belief,
    status: belief.status || "active",
    [fields.beliefClass]: resolved.belief_class,
    [fields.decayMode]: resolved.decay_mode,
    [fields.confidenceFloor]: resolved.confidence_floor,
    [fields.reviewThreshold]: resolved.review_threshold,
    [fields.archivable]: resolved.archivable,
    [fields.refreshStrategy]: resolved.refresh_strategy,
  };
}

function annotateBeliefCollection(beliefs) {
  return beliefs.map((belief) => annotateBeliefWithGovernanceProfile(belief));
}

module.exports = {
  annotateBeliefCollection,
  annotateBeliefWithGovernanceProfile,
};
