const { evaluateAction } = require("./deus-action-policy");
const {
  getWorldModelAgeHours,
  isWorldModelFresh,
} = require("../world-model/world-model-schema");
const { normalizePolicyStringArray } = require("./action-policy-helpers");
const { buildAmbientActionIntent } = require("./deus-policy-surface-intent");

function summarizeWorldModelSurface(worldModel, options = {}) {
  return {
    available: true,
    source: options.source || "provided",
    generatedAt: worldModel.generated_at,
    workspaceDay: worldModel.workspace_day,
    confidence: worldModel.confidence,
    fresh: isWorldModelFresh(worldModel, options.now),
    ageHours: getWorldModelAgeHours(worldModel, options.now),
    activeProject: worldModel.workspace_model?.active_project || null,
    openLoops: normalizePolicyStringArray(
      worldModel.environment_model?.open_tensions,
    ).length,
    activeRisks: normalizePolicyStringArray(
      worldModel.action_priors?.active_risks,
    ).length,
    hardBlocks: normalizePolicyStringArray(
      worldModel.action_priors?.hard_blocks,
    ),
    preferredModes: normalizePolicyStringArray(
      worldModel.action_priors?.preferred_modes,
    ),
  };
}

function summarizeActionPolicySurface(worldModel, options = {}) {
  const ambientIntent = options.intent || buildAmbientActionIntent(worldModel);
  const evaluation =
    options.evaluation ||
    evaluateAction(ambientIntent, {
      ...options,
      worldModel,
      mode: "advisory",
    });

  const summary = {
    available: true,
    intent: {
      goal: evaluation.intent.goal,
      actionType: evaluation.intent.action_type,
      target: evaluation.intent.target,
    },
    decision: evaluation.decision,
    recommendedMode: evaluation.recommendedMode,
    recommendedNextStep: evaluation.recommendedNextStep,
    summary: evaluation.decisionSummary,
    ripenessScore: evaluation.ripeness.score,
    costBand: evaluation.cost.band,
    costTotal: evaluation.cost.total,
    blockers: evaluation.blockers,
    requiresHumanConfirmation: evaluation.requiresHumanConfirmation,
    dissensusDecision: evaluation.dissensus?.decision || "allow",
    dissensusLevel: evaluation.dissensus?.level || "none",
    requiresDissensusOverride: Boolean(evaluation.requiresDissensusOverride),
  };

  if (options.includeEvaluation === true) {
    summary.evaluation = evaluation;
  }

  return summary;
}

module.exports = {
  summarizeActionPolicySurface,
  summarizeWorldModelSurface,
};
