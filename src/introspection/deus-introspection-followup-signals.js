"use strict";

const { FOLLOWUP_GUARDRAILS } = require("./deus-introspection-followup-guardrails");
const {
  buildFollowupSignals,
  normalizeArray,
  normalizeDecayTuningCandidates,
  normalizeNumber,
  normalizeObject,
} = require("./deus-introspection-followup-normalize");
const {
  buildRecommendedActions,
  resolveAllowedMeasures,
} = require("./deus-introspection-followup-actions");
const {
  resolveFollowupDecision,
  resolveSeverity,
} = require("./deus-introspection-followup-decision");

module.exports = {
  FOLLOWUP_GUARDRAILS,
  buildFollowupSignals,
  buildRecommendedActions,
  normalizeArray,
  normalizeDecayTuningCandidates,
  normalizeNumber,
  normalizeObject,
  resolveAllowedMeasures,
  resolveFollowupDecision,
  resolveSeverity,
};
