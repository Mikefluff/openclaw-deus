"use strict";

const { RIPENESS_POLICY } = require("./action-policy-config");

function buildRipenessRationale({
  intent,
  worldModel,
  dependencyStatus,
  blockers,
  missingPreconditions,
  factorScores,
}) {
  const rationale = [];

  rationale.push(intent.goal ? "goal is clear" : "goal is underspecified");
  rationale.push(
    intent.requires_human_confirmation
      ? intent.confirmed_by_human
        ? "human confirmation is present"
        : "human confirmation is missing"
      : "human confirmation is not required",
  );
  rationale.push(
    dependencyStatus.missing.length === 0
      ? dependencyStatus.dependencies.length === 0
        ? "action has no explicit dependencies"
        : "dependencies are ready"
      : dependencyStatus.ready.length > 0
        ? "dependency readiness is partial"
        : "dependencies are not ready",
  );

  if (!worldModel) {
    rationale.push("world model is unavailable");
  } else {
    rationale.push(
      factorScores.world_model_quality >= 0.75
        ? "world model quality is sufficient"
        : "world model quality is partial",
    );
    if (worldModel.workspace_model?.repo_dirty) {
      rationale.push("repo state adds friction");
    }
  }

  if (blockers.length > 0) {
    rationale.push(`hard blockers present: ${blockers.join(", ")}`);
  } else if (missingPreconditions.length > 0) {
    rationale.push(`missing preconditions: ${missingPreconditions.join(", ")}`);
  }

  return rationale;
}

function classifyRipeness(score, blockers, missingPreconditions, policy = RIPENESS_POLICY) {
  if (blockers.length > 0) {
    return "blocked";
  }

  if (score >= policy.actNowThreshold && missingPreconditions.length === 0) {
    return "act_now";
  }

  if (score >= policy.prepareThreshold) {
    return "prepare";
  }

  if (score >= policy.waitThreshold) {
    return "wait";
  }

  return "blocked";
}

module.exports = {
  buildRipenessRationale,
  classifyRipeness,
};
