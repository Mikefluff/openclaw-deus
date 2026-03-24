"use strict";

const { normalizeDissensusDecision } = require("./deus-dissensus-schema");
const { appendDissensusEvent } = require("./deus-dissensus-runtime-events");
const { upsertOpenCase } = require("./deus-dissensus-runtime-cases");
const { resolveDissensusOpenCasesWritePath } = require("../runtime/runtime-surface-paths");

function recordDissensusEvaluation(evaluationInput, options = {}) {
  const evaluation = evaluationInput || {};
  const decisionInput = {
    ...(evaluation.dissensus || evaluation),
    evaluated_at:
      evaluation.dissensus?.evaluated_at ||
      evaluation.evaluated_at ||
      options.timestamp,
    action_type:
      evaluation.dissensus?.action_type ||
      evaluation.intent?.action_type ||
      evaluation.intent?.actionType,
    target: evaluation.dissensus?.target || evaluation.intent?.target,
  };
  const decision = normalizeDissensusDecision(decisionInput);
  const eventResult = appendDissensusEvent(decision, options);
  const casesArtifact = upsertOpenCase(decision, options);

  return {
    decision,
    logPath: eventResult.logPath,
    openCasesPath:
      options.filePath || resolveDissensusOpenCasesWritePath(options),
    openCases: casesArtifact,
  };
}

module.exports = {
  recordDissensusEvaluation,
};
