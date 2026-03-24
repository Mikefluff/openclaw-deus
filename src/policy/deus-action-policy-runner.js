"use strict";

const {
  ACTION_COORDINATOR_POLICY,
} = require("./action-policy-config");
const { normalizeActionIntent } = require("./action-intent-schema");
const { evaluateDissensus } = require("./deus-dissensus-engine");
const { estimateActionCost } = require("./action-cost-model");
const { estimateRipeness } = require("./ripeness-estimator");
const {
  applyDissensusToDecision,
  selectDecision,
} = require("./deus-action-policy-decision");
const {
  buildEvaluationSummary,
} = require("./deus-action-policy-summary");
const {
  compactWorldModelRef,
  getOrBuildWorldModel,
} = require("./deus-action-policy-world-model");

function evaluateAction(intentInput, options = {}) {
  const normalizedIntent = normalizeActionIntent(intentInput);
  const { worldModel, source } = getOrBuildWorldModel(options);
  const ripeness = estimateRipeness(normalizedIntent, worldModel, options);
  const cost = estimateActionCost(normalizedIntent, worldModel, options);
  const coordinatorDecision = selectDecision(
    normalizedIntent,
    worldModel,
    ripeness,
    cost,
    options,
  );
  const dissensus = evaluateDissensus(normalizedIntent, worldModel, options);
  const decision = applyDissensusToDecision(coordinatorDecision, dissensus);
  const summary = buildEvaluationSummary({
    decision,
    worldModel,
    source,
    ripeness,
    cost,
    dissensus,
    normalizedIntent,
  });

  return {
    version: 1,
    policy_mode: options.mode || ACTION_COORDINATOR_POLICY.mode,
    evaluated_at: new Date().toISOString(),
    intent: normalizedIntent,
    decision,
    coordinatorDecision,
    shouldActNow: decision === "direct_act",
    worldModelRef: compactWorldModelRef(worldModel, source),
    ripeness,
    cost,
    dissensus,
    blockers: ripeness.blockers,
    missingPreconditions: ripeness.missing_preconditions,
    recommendedMode: decision,
    recommendedNextStep: summary.recommendedNextStep,
    requiresHumanConfirmation: normalizedIntent.requires_human_confirmation,
    requiresDissensusOverride:
      dissensus.override_allowed && dissensus.decision !== "allow",
    decisionSummary: summary.decisionSummary,
    preferredModes: summary.preferredModes,
  };
}

module.exports = {
  evaluateAction,
};
