const { shouldRequestLlmAnalysis } = require("../beliefs/belief-policy");

function buildIntrospectionReportData({
  actionPolicySurface = {},
  beliefs = [],
  coherenceScore,
  context = {},
  contradictionResult = {},
  decayAuditSurface = {},
  focusStateSurface = {},
  lowConfidence = [],
  memoryExists = {},
  policyFeedback = {},
  sleepPlannerSurface = {},
  today,
  uncommittedCount,
  worldModelSurface = {},
}) {
  return {
    date: today,
    coherence: coherenceScore,
    beliefs: beliefs.length,
    belief_details: beliefs.map((belief) => ({
      id: belief.belief_id,
      confidence: belief.confidence,
      source: belief.source_type,
      scope: belief.context_scope,
    })),
    low_confidence: lowConfidence.map((belief) => belief.belief_id),
    memory: memoryExists,
    activity: context.activityStats,
    uncommitted: uncommittedCount,
    timestamp: new Date().toISOString(),
    world_model: worldModelSurface,
    focus_state: focusStateSurface,
    sleep_planner: sleepPlannerSurface,
    action_policy: actionPolicySurface,
    policy_feedback: policyFeedback,
    decay_policy_audit: decayAuditSurface,
    belief_processing: {
      extracted: context.extractionResult?.extracted || 0,
      contradictions: contradictionResult.contradictions_found || 0,
      decayed: context.decayResult?.decayed || 0,
    },
    llm_analysis_needed: shouldRequestLlmAnalysis({
      coherenceScore,
      lowConfidenceCount: lowConfidence.length,
      contradictionsFound: contradictionResult.contradictions_found || 0,
    }),
  };
}

module.exports = {
  buildIntrospectionReportData,
};
