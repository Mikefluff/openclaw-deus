"use strict";

const {
  RIPENESS_POLICY,
  WORLD_MODEL_POLICY,
} = require("./action-policy-config");
const {
  hasHardBlock,
  normalizePolicyStringArray,
} = require("./action-policy-helpers");
const { isWorldModelFresh } = require("../world-model/world-model-schema");

function collectRipenessBlockers(intent, worldModel, policy = RIPENESS_POLICY) {
  const blockers = [];

  if (
    policy.hardBlockOnMissingHumanConfirmation &&
    intent.requires_human_confirmation &&
    !intent.confirmed_by_human
  ) {
    blockers.push("missing_human_confirmation");
  }

  if (
    policy.hardBlockOnInvariantConflict &&
    (hasHardBlock(worldModel, "invariant_conflict") ||
      hasHardBlock(worldModel, "invariant_violation"))
  ) {
    blockers.push("invariant_conflict");
  }

  return blockers;
}

function collectMissingPreconditions(intent, worldModel, dependencyStatus, now) {
  const missing = [];

  if (!worldModel) {
    missing.push("missing_world_model");
    return missing;
  }

  if (!isWorldModelFresh(worldModel, now, WORLD_MODEL_POLICY)) {
    missing.push("stale_world_model");
  }

  if (
    intent.high_impact &&
    worldModel.confidence < WORLD_MODEL_POLICY.minimumConfidenceForHighImpact
  ) {
    missing.push("insufficient_world_model_confidence");
  }

  dependencyStatus.missing.forEach((dependency) => {
    missing.push(`dependency_not_ready:${dependency}`);
  });

  if (
    intent.high_impact &&
    normalizePolicyStringArray(worldModel.action_priors?.hard_blocks).includes(
      "waiting_for_condition",
    )
  ) {
    missing.push("waiting_for_condition");
  }

  if (
    intent.high_impact &&
    worldModel.workspace_model?.repo_dirty &&
    (intent.repo_mutation || intent.action_type === "deploy")
  ) {
    missing.push("repo_dirty_for_high_impact_action");
  }

  return missing;
}

module.exports = {
  collectMissingPreconditions,
  collectRipenessBlockers,
};
