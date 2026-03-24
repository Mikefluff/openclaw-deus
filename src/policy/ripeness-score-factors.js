"use strict";

const { WORLD_MODEL_POLICY } = require("./action-policy-config");
const {
  clampScore,
  normalizePolicyStringArray,
} = require("./action-policy-helpers");
const { isWorldModelFresh } = require("../world-model/world-model-schema");

function getGoalClarityScore(intent) {
  let score = 0;

  if (intent.goal) {
    score += 0.5;
  }
  if (intent.action_type !== "unknown") {
    score += 0.25;
  }
  if (intent.target) {
    score += 0.25;
  }

  return clampScore(score);
}

function getWorldModelQualityScore(worldModel, now) {
  if (!worldModel) {
    return 0.1;
  }

  const freshness = isWorldModelFresh(worldModel, now, WORLD_MODEL_POLICY) ? 1 : 0.35;
  return clampScore(worldModel.confidence * 0.7 + freshness * 0.3);
}

function getContextFreshnessScore(worldModel) {
  if (!worldModel) {
    return 0.2;
  }

  const memoryDays = worldModel.workspace_model?.memory_freshness_days;
  const hasIntrospection = Boolean(worldModel.workspace_model?.introspection_date);

  let score = 0.4;

  if (memoryDays === 0) {
    score += 0.4;
  } else if (memoryDays === 1) {
    score += 0.25;
  } else if (memoryDays === null || memoryDays === undefined) {
    score += 0.1;
  }

  if (hasIntrospection) {
    score += 0.2;
  }

  return clampScore(score);
}

function getAuthorizationScore(intent) {
  if (!intent.requires_human_confirmation) {
    return 1;
  }

  return intent.confirmed_by_human ? 1 : 0;
}

function getEnvironmentReadinessScore(worldModel) {
  if (!worldModel) {
    return 0.2;
  }

  const hardBlocks = normalizePolicyStringArray(worldModel.action_priors?.hard_blocks);
  const activeRisks = normalizePolicyStringArray(worldModel.action_priors?.active_risks);
  let score = 1;

  score -= Math.min(0.45, hardBlocks.length * 0.15);
  score -= Math.min(0.25, activeRisks.length * 0.05);

  if (worldModel.workspace_model?.repo_dirty) {
    score -= 0.1;
  }

  return clampScore(score);
}

function buildRipenessFactorScores(intent, worldModel, dependencyStatus, now) {
  return {
    goal_clarity: getGoalClarityScore(intent),
    world_model_quality: getWorldModelQualityScore(worldModel, now),
    dependency_readiness: dependencyStatus.score,
    authorization: getAuthorizationScore(intent),
    environment_readiness: getEnvironmentReadinessScore(worldModel),
    context_freshness: getContextFreshnessScore(worldModel),
  };
}

module.exports = {
  buildRipenessFactorScores,
  getAuthorizationScore,
  getContextFreshnessScore,
  getEnvironmentReadinessScore,
  getGoalClarityScore,
  getWorldModelQualityScore,
};
