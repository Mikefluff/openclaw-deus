"use strict";

const {
  ACTION_COORDINATOR_POLICY,
  RIPENESS_POLICY,
} = require("./action-policy-config");

function translateMissingPrecondition(marker, worldModel) {
  if (marker.startsWith("dependency_not_ready:")) {
    const dependency = marker.split(":").slice(1).join(":");
    return `prepare dependency readiness for ${dependency}`;
  }

  switch (marker) {
    case "stale_world_model":
      return "refresh the world model before acting";
    case "insufficient_world_model_confidence":
      return "gather more context and reduce uncertainty before acting";
    case "waiting_for_condition":
      return worldModel.workspace_model?.waiting_for
        ? `wait for ${worldModel.workspace_model.waiting_for}`
        : "wait for the current blocking condition to clear";
    case "repo_dirty_for_high_impact_action":
      return "review tracked repository changes before high-impact action";
    case "missing_world_model":
      return "build or load a world model before evaluating the action";
    default:
      return `resolve ${marker}`;
  }
}

function selectBlockerResolution(ripeness) {
  const blocker = ripeness.blockers[0];

  switch (blocker) {
    case "missing_human_confirmation":
      return "request explicit human confirmation before acting";
    case "invariant_conflict":
      return "reframe the action to avoid invariant conflict";
    default:
      return ripeness.missing_preconditions[0]
        ? `resolve ${ripeness.missing_preconditions[0]} before acting`
        : "resolve the active blocker before acting";
  }
}

function shouldReframe(
  intent,
  ripeness,
  cost,
  policy = ACTION_COORDINATOR_POLICY,
) {
  return (
    intent.action_type === "unknown" ||
    ripeness.factor_scores.goal_clarity < policy.reframeGoalClarityThreshold ||
    (cost.breakdown.structuralViolation >=
      policy.reframeStructuralViolationThreshold &&
      ripeness.score < RIPENESS_POLICY.actNowThreshold)
  );
}

function selectDecision(intent, worldModel, ripeness, cost, options = {}) {
  const policy = options.policy || ACTION_COORDINATOR_POLICY;
  const waitingState =
    worldModel.workspace_model?.status === "waiting" ||
    ripeness.missing_preconditions.includes("waiting_for_condition");

  if (ripeness.blockers.length > 0) {
    return "blocked";
  }

  if (shouldReframe(intent, ripeness, cost, policy)) {
    return "reframe";
  }

  if (
    ripeness.score >= RIPENESS_POLICY.actNowThreshold &&
    cost.total <= policy.directActCostThreshold &&
    ripeness.missing_preconditions.length === 0
  ) {
    return "direct_act";
  }

  if (ripeness.score >= RIPENESS_POLICY.prepareThreshold) {
    return "prepare_conditions";
  }

  if (waitingState || ripeness.score >= RIPENESS_POLICY.waitThreshold) {
    return "wait";
  }

  return "observe";
}

function applyDissensusToDecision(decision, dissensus) {
  if (!dissensus || dissensus.decision === "allow") {
    return decision;
  }

  if (dissensus.decision === "pause_l2" || dissensus.decision === "refuse_l3") {
    return "blocked";
  }

  return decision;
}

module.exports = {
  applyDissensusToDecision,
  selectBlockerResolution,
  selectDecision,
  shouldReframe,
  translateMissingPrecondition,
};
