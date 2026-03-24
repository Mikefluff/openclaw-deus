"use strict";

const { normalizePolicyStringArray } = require("./action-policy-helpers");
const { POLICY_EVENT_TYPES } = require("./deus-policy-feedback-constants");
const {
  buildPolicyFrictionTokens,
} = require("./deus-policy-feedback-friction");
const {
  deriveOutcomeSuccess,
  normalizePolicyEventType,
} = require("./deus-policy-feedback-normalize");

function buildPolicyFeedbackContext(options = {}) {
  const surface = options.surface || {};
  const actionPolicy = surface.actionPolicy || {};
  const worldModel = surface.worldModel || {};
  const evaluation = options.evaluation || {};
  const outcome = options.outcome || {};
  const policyEventType =
    normalizePolicyEventType(options.policyEventType || options.policyEvent) ||
    POLICY_EVENT_TYPES.ACTION_EVALUATION;
  const intent = evaluation.intent || {};

  const context = {
    policyEventType,
    source: options.source || "policy-runtime",
    goal: actionPolicy.intent?.goal || intent.goal || null,
    actionType:
      actionPolicy.intent?.actionType ||
      intent.action_type ||
      intent.actionType ||
      outcome.actionType ||
      null,
    target:
      actionPolicy.intent?.target || intent.target || outcome.target || null,
    decision: actionPolicy.decision || evaluation.decision || null,
    recommendedMode:
      actionPolicy.recommendedMode || evaluation.recommendedMode || null,
    recommendedNextStep:
      actionPolicy.recommendedNextStep ||
      evaluation.recommendedNextStep ||
      null,
    summary:
      actionPolicy.summary ||
      evaluation.decisionSummary ||
      outcome.notes ||
      null,
    blockers: normalizePolicyStringArray(
      actionPolicy.blockers || evaluation.blockers || outcome.blockers,
    ),
    missingPreconditions: normalizePolicyStringArray(
      evaluation.missingPreconditions,
    ),
    hardBlocks: normalizePolicyStringArray(worldModel.hardBlocks),
    costBand:
      actionPolicy.costBand ||
      evaluation.cost?.band ||
      outcome.costBand ||
      null,
    costTotal:
      actionPolicy.costTotal ??
      evaluation.cost?.total ??
      outcome.costTotal ??
      null,
    ripenessScore:
      actionPolicy.ripenessScore ??
      evaluation.ripeness?.score ??
      outcome.ripenessScore ??
      null,
    worldModelConfidence:
      worldModel.confidence ?? evaluation.worldModelRef?.confidence ?? null,
    workspaceDay: worldModel.workspaceDay || null,
    activeProject: worldModel.activeProject || outcome.activeProject || null,
    success: deriveOutcomeSuccess(outcome, policyEventType, evaluation),
    maintenanceTailObserved: outcome.maintenanceTailObserved || null,
    followupRequired: Boolean(outcome.followupRequired),
    notes: outcome.notes || null,
    dissensusDecision:
      evaluation.dissensus?.decision || outcome.dissensusDecision || null,
    dissensusLevel:
      evaluation.dissensus?.level || outcome.dissensusLevel || null,
    dissensusTrigger:
      evaluation.dissensus?.trigger_type || outcome.dissensusTrigger || null,
    dissensusOverrideRequired:
      evaluation.requiresDissensusOverride ||
      outcome.dissensusOverrideRequired ||
      false,
  };

  context.friction = buildPolicyFrictionTokens({
    blockers: context.blockers,
    missingPreconditions: context.missingPreconditions,
    hardBlocks: context.hardBlocks,
    maintenanceTailObserved: context.maintenanceTailObserved,
    followupRequired: context.followupRequired,
    success: context.success,
  });

  return context;
}

module.exports = {
  buildPolicyFeedbackContext,
};
