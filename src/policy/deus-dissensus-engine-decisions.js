"use strict";

const { normalizeDissensusDecision } = require("./deus-dissensus-schema");

function buildOperatorMessage(decision) {
  switch (decision.decision) {
    case "refuse_l3":
      return `[DISSENSUS-3] Refusal: ${decision.reason}`;
    case "pause_l2":
      return `[DISSENSUS-2] Pause requested: ${decision.reason}`;
    case "signal_l1":
      return `[DISSENSUS-1] Signal: ${decision.reason}`;
    default:
      return "";
  }
}

function buildDissensusDecision(input, reason) {
  return normalizeDissensusDecision({
    ...input,
    reason,
    operator_message: buildOperatorMessage({
      decision: input.decision,
      reason,
    }),
  });
}

module.exports = {
  buildDissensusDecision,
  buildOperatorMessage,
};
