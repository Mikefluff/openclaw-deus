const {
  ACTION_COST_POLICY,
} = require("./action-policy-config");
const {
  clampScore,
  normalizePolicyStringArray,
  normalizeWorldModelForPolicy,
  resolveDependencyStatus,
} = require("./action-policy-helpers");
const {
  normalizeActionIntent,
  resolveActionTypeProfile,
} = require("./action-intent-schema");

function getInitialBreakdown(intent) {
  const profile = resolveActionTypeProfile(intent.action_type);
  return {
    execution: profile.base_cost.execution,
    rollback: profile.base_cost.rollback,
    maintenance: profile.base_cost.maintenance,
    epistemic: profile.base_cost.epistemic,
    autonomy: profile.base_cost.autonomy,
    externality: profile.base_cost.externality,
    structuralViolation: profile.base_cost.structuralViolation,
  };
}

function applyWorldModelAdjustments(breakdown, intent, worldModel, dependencyStatus) {
  const rationale = [];

  if (!worldModel) {
    breakdown.epistemic = clampScore(breakdown.epistemic + 0.25);
    breakdown.execution = clampScore(breakdown.execution + 0.1);
    rationale.push("missing world model increases epistemic and execution cost");
    return rationale;
  }

  if (worldModel.workspace_model?.repo_dirty && intent.repo_mutation) {
    breakdown.execution = clampScore(breakdown.execution + 0.12);
    breakdown.epistemic = clampScore(breakdown.epistemic + 0.08);
    breakdown.structuralViolation = clampScore(
      breakdown.structuralViolation + 0.06,
    );
    rationale.push("dirty repo increases execution and structural cost");
  }

  const memoryDays = worldModel.workspace_model?.memory_freshness_days;
  if (typeof memoryDays === "number" && memoryDays > 0) {
    breakdown.epistemic = clampScore(
      breakdown.epistemic + Math.min(0.18, memoryDays * 0.06),
    );
    rationale.push("stale memory increases epistemic cost");
  }

  const hardBlocks = normalizePolicyStringArray(worldModel.action_priors?.hard_blocks);
  if (hardBlocks.length > 0) {
    breakdown.execution = clampScore(
      breakdown.execution + Math.min(0.16, hardBlocks.length * 0.05),
    );
    breakdown.rollback = clampScore(
      breakdown.rollback + Math.min(0.12, hardBlocks.length * 0.04),
    );
    breakdown.epistemic = clampScore(
      breakdown.epistemic + Math.min(0.12, hardBlocks.length * 0.04),
    );
    rationale.push("hard blocks increase intervention friction");
  }

  const openTensionCount = normalizePolicyStringArray(
    worldModel.environment_model?.open_tensions,
  ).length;
  if (openTensionCount > 0) {
    breakdown.maintenance = clampScore(
      breakdown.maintenance + Math.min(0.16, openTensionCount * 0.02),
    );
    breakdown.structuralViolation = clampScore(
      breakdown.structuralViolation + Math.min(0.1, openTensionCount * 0.01),
    );
    rationale.push("open tensions increase maintenance tail");
  }

  if (dependencyStatus.missing.length > 0) {
    breakdown.execution = clampScore(
      breakdown.execution + Math.min(0.15, dependencyStatus.missing.length * 0.05),
    );
    breakdown.maintenance = clampScore(
      breakdown.maintenance + Math.min(0.1, dependencyStatus.missing.length * 0.03),
    );
    rationale.push("missing dependencies increase execution cost");
  }

  return rationale;
}

function applyIntentAdjustments(breakdown, intent) {
  const rationale = [];

  if (intent.external) {
    breakdown.externality = clampScore(breakdown.externality + 0.06);
    rationale.push("external scope increases externality cost");
  }

  if (intent.destructive) {
    breakdown.rollback = clampScore(breakdown.rollback + 0.02);
    breakdown.structuralViolation = clampScore(
      breakdown.structuralViolation + 0.04,
    );
    rationale.push("destructive behavior raises rollback and structural cost");
  }

  if (intent.requires_human_confirmation && !intent.confirmed_by_human) {
    breakdown.autonomy = clampScore(breakdown.autonomy + 0.35);
    breakdown.externality = clampScore(breakdown.externality + 0.05);
    rationale.push("missing human confirmation raises autonomy cost");
  } else if (intent.confirmed_by_human) {
    breakdown.autonomy = clampScore(breakdown.autonomy - 0.08, breakdown.autonomy);
    rationale.push("human confirmation reduces autonomy cost");
  }

  if (intent.belief_mutation) {
    breakdown.epistemic = clampScore(breakdown.epistemic + 0.05);
    breakdown.structuralViolation = clampScore(
      breakdown.structuralViolation + 0.04,
    );
    rationale.push("belief mutation raises epistemic governance cost");
  }

  return rationale;
}

function calculateTotalCost(breakdown, policy = ACTION_COST_POLICY) {
  const weights = policy.weights || ACTION_COST_POLICY.weights;

  return clampScore(
    breakdown.execution * weights.execution +
      breakdown.rollback * weights.rollback +
      breakdown.maintenance * weights.maintenance +
      breakdown.epistemic * weights.epistemic +
      breakdown.autonomy * weights.autonomy +
      breakdown.externality * weights.externality +
      breakdown.structuralViolation * weights.structuralViolation,
  );
}

function getCostBand(total, policy = ACTION_COST_POLICY) {
  if (total >= policy.highCostThreshold) {
    return "high";
  }

  if (total >= policy.mediumCostThreshold) {
    return "medium";
  }

  return "low";
}

function estimateActionCost(intentInput, worldModelInput, options = {}) {
  const intent = normalizeActionIntent(intentInput);
  const worldModel = normalizeWorldModelForPolicy(worldModelInput);
  const dependencyStatus = resolveDependencyStatus(intent, worldModel);
  const breakdown = getInitialBreakdown(intent);
  const rationale = [
    ...applyWorldModelAdjustments(
      breakdown,
      intent,
      worldModel,
      dependencyStatus,
    ),
    ...applyIntentAdjustments(breakdown, intent),
  ];
  const total = calculateTotalCost(breakdown, options.policy);

  return {
    total,
    band: getCostBand(total, options.policy),
    breakdown,
    dependency_status: dependencyStatus,
    rationale,
  };
}

module.exports = {
  applyIntentAdjustments,
  applyWorldModelAdjustments,
  calculateTotalCost,
  estimateActionCost,
  getCostBand,
  getInitialBreakdown,
};
