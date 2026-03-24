"use strict";

const {
  hasHardBlock,
  normalizePolicyStringArray,
  normalizeWorldModelForPolicy,
} = require("./action-policy-helpers");

function resolveInvariantRefs(worldModel) {
  const model = normalizeWorldModelForPolicy(worldModel);
  if (!model) {
    return ["I1", "I2", "I3", "I4"];
  }

  const refs = normalizePolicyStringArray(
    (model.self_model?.invariants || []).map((entry) => entry.id),
  ).filter((value) => /^I[1-4]$/u.test(value));

  return refs.length > 0 ? refs : ["I1", "I2", "I3", "I4"];
}

function hasInvariantConflict(worldModel) {
  return (
    hasHardBlock(worldModel, "invariant_conflict") ||
    hasHardBlock(worldModel, "invariant_violation")
  );
}

module.exports = {
  hasInvariantConflict,
  resolveInvariantRefs,
};
