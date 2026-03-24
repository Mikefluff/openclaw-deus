"use strict";

const {
  normalizePolicyStringArray,
} = require("./action-policy-helpers");
const {
  selectBlockerResolution,
  translateMissingPrecondition,
} = require("./deus-action-policy-decision");

function getTopCostDrivers(cost, limit = 2) {
  return Object.entries(cost.breakdown)
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([name]) => name);
}

function selectRecommendedNextStep({
  decision,
  intent,
  worldModel,
  ripeness,
  cost,
  dissensus,
}) {
  if (dissensus?.decision === "refuse_l3") {
    return "stop and reframe the action because a dissensus refusal is active";
  }

  if (dissensus?.decision === "pause_l2") {
    return dissensus.override_token_kind === "human_confirmation"
      ? "request explicit human confirmation before acting"
      : "request an explicit level-2 override before acting";
  }

  if (decision === "blocked") {
    return selectBlockerResolution(ripeness);
  }

  if (decision === "direct_act") {
    return null;
  }

  if (decision === "prepare_conditions") {
    if (ripeness.missing_preconditions.length > 0) {
      return translateMissingPrecondition(
        ripeness.missing_preconditions[0],
        worldModel,
      );
    }

    if (cost.band === "high") {
      return "break the action into a lower-cost preparatory step";
    }

    return "prepare the remaining conditions and re-evaluate";
  }

  if (decision === "wait") {
    if (worldModel.workspace_model?.waiting_for) {
      return `wait for ${worldModel.workspace_model.waiting_for}`;
    }

    if (ripeness.missing_preconditions.includes("waiting_for_condition")) {
      return translateMissingPrecondition("waiting_for_condition", worldModel);
    }

    return "observe the environment until conditions change, then re-evaluate";
  }

  if (decision === "reframe") {
    return `reframe ${intent.action_type} into a lower-cost or clearer move`;
  }

  const costDrivers = getTopCostDrivers(cost);
  if (costDrivers.length > 0) {
    return `gather context and clarify the action before addressing ${costDrivers.join(", ")}`;
  }

  return "gather more context and re-evaluate";
}

function summarizeDecision(decision, ripeness, cost) {
  if (
    ripeness?.dissensus?.decision === "refuse_l3" ||
    ripeness?.dissensus?.decision === "pause_l2"
  ) {
    return ripeness.dissensus.reason || "dissensus gate prevents action";
  }

  if (decision === "blocked") {
    return "hard blocker prevents action";
  }

  if (decision === "direct_act") {
    return "ripeness is high and intervention cost is low";
  }

  if (decision === "prepare_conditions") {
    return "conditions are partially ready but preparation is still cheaper than acting now";
  }

  if (decision === "wait") {
    return "ripeness is not yet sufficient for action, but the frame is stable enough to wait";
  }

  if (decision === "reframe") {
    return "the proposed action should be reframed before execution";
  }

  const highestCost = getTopCostDrivers(cost, 1)[0] || "context";
  return `insufficient readiness suggests observation before changing ${highestCost}`;
}

function buildEvaluationSummary({
  decision,
  worldModel,
  source,
  ripeness,
  cost,
  dissensus,
  normalizedIntent,
}) {
  return {
    decisionSummary: summarizeDecision(
      decision,
      { ...ripeness, dissensus },
      cost,
    ),
    preferredModes: normalizePolicyStringArray(
      worldModel.action_priors?.preferred_modes,
    ),
    recommendedNextStep: selectRecommendedNextStep({
      decision,
      intent: normalizedIntent,
      worldModel,
      ripeness,
      cost,
      dissensus,
    }),
  };
}

module.exports = {
  buildEvaluationSummary,
  getTopCostDrivers,
  selectRecommendedNextStep,
  summarizeDecision,
};
