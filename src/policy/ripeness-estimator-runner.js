"use strict";

const {
  clampScore,
  normalizeWorldModelForPolicy,
  resolveDependencyStatus,
} = require("./action-policy-helpers");
const { normalizeActionIntent } = require("./action-intent-schema");
const {
  collectMissingPreconditions,
  collectRipenessBlockers,
} = require("./ripeness-preconditions");
const {
  buildRipenessRationale,
  classifyRipeness,
} = require("./ripeness-rationale");
const { buildRipenessFactorScores } = require("./ripeness-score-factors");

function estimateRipeness(intentInput, worldModelInput, options = {}) {
  const now = options.now || new Date();
  const intent = normalizeActionIntent(intentInput);
  const worldModel = normalizeWorldModelForPolicy(worldModelInput);
  const dependencyStatus = resolveDependencyStatus(intent, worldModel);
  const blockers = collectRipenessBlockers(intent, worldModel, options.policy);
  const missingPreconditions = collectMissingPreconditions(
    intent,
    worldModel,
    dependencyStatus,
    now,
  );
  const factorScores = buildRipenessFactorScores(
    intent,
    worldModel,
    dependencyStatus,
    now,
  );

  let score = clampScore(
    factorScores.goal_clarity * 0.22 +
      factorScores.world_model_quality * 0.2 +
      factorScores.dependency_readiness * 0.2 +
      factorScores.authorization * 0.18 +
      factorScores.environment_readiness * 0.12 +
      factorScores.context_freshness * 0.08,
  );

  if (missingPreconditions.length > 0) {
    score = clampScore(
      score - Math.min(0.25, missingPreconditions.length * 0.05),
    );
  }

  const ripenessClass = classifyRipeness(
    score,
    blockers,
    missingPreconditions,
    options.policy,
  );

  return {
    score,
    class: ripenessClass,
    blockers,
    missing_preconditions: missingPreconditions,
    dependency_status: dependencyStatus,
    factor_scores: factorScores,
    rationale: buildRipenessRationale({
      intent,
      worldModel,
      dependencyStatus,
      blockers,
      missingPreconditions,
      factorScores,
    }),
  };
}

module.exports = {
  estimateRipeness,
};
