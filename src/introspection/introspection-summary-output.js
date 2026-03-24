function buildSummaryOutput(context = {}) {
  const reportResult = context.reportResult || {};
  const integrationResult = context.integrationResult || {};
  const worldModelResult = context.worldModelResult || {};
  const stageFailures = context.stageFailures || [];
  const decayAuditResult = context.decayAuditResult || {};

  return {
    introspectionProfile: context.profile || "full",
    executedStages: context.executedStages || [],
    coherence: reportResult.coherence,
    beliefs: reportResult.beliefs,
    memory: reportResult.memory,
    activity: reportResult.activity,
    llm_needed: reportResult.llm_needed,
    memorySearchEffectiveness: integrationResult.effectiveness,
    openclawIntegration: {
      memorySearchAvailable: integrationResult.memorySearchAvailable,
      flushCallbacksRegistered: integrationResult.flushCallbacksRegistered,
    },
    worldModel: worldModelResult.worldModel || reportResult.worldModel || {},
    focusState: worldModelResult.focusState || reportResult.focusState || {},
    sleepPlanner:
      worldModelResult.sleepPlanner || reportResult.sleepPlanner || {},
    actionPolicy:
      worldModelResult.actionPolicy || reportResult.actionPolicy || {},
    policyFeedback: reportResult.policyFeedback || {},
    decayAudit: decayAuditResult.audit || reportResult.decayAudit || {},
    followup: reportResult.followup || null,
    beliefProcessing: {
      extracted: context.extractionResult?.extracted || 0,
      contradictions: context.contradictionResult?.contradictions_found || 0,
      decayed: context.decayResult?.decayed || 0,
    },
    pipelineStatus: stageFailures.length > 0 ? "degraded" : "ok",
    stageFailures,
  };
}

module.exports = {
  buildSummaryOutput,
};
