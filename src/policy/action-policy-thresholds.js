const WORLD_MODEL_POLICY = Object.freeze({
  staleAfterHours: 12,
  recentMemoryWindowDays: 7,
  recentLogEntryLimit: 50,
  minimumConfidenceForHighImpact: 0.65,
});

const RIPENESS_POLICY = Object.freeze({
  actNowThreshold: 0.8,
  prepareThreshold: 0.55,
  waitThreshold: 0.35,
  hardBlockOnMissingHumanConfirmation: true,
  hardBlockOnInvariantConflict: true,
});

const ACTION_COST_POLICY = Object.freeze({
  highCostThreshold: 0.7,
  mediumCostThreshold: 0.4,
  weights: Object.freeze({
    execution: 0.18,
    rollback: 0.16,
    maintenance: 0.16,
    epistemic: 0.2,
    autonomy: 0.12,
    externality: 0.1,
    structuralViolation: 0.08,
  }),
});

const ACTION_COORDINATOR_POLICY = Object.freeze({
  mode: "advisory",
  directActCostThreshold: 0.45,
  reframeGoalClarityThreshold: 0.45,
  reframeStructuralViolationThreshold: 0.65,
});

module.exports = {
  ACTION_COORDINATOR_POLICY,
  ACTION_COST_POLICY,
  RIPENESS_POLICY,
  WORLD_MODEL_POLICY,
};
