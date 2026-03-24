const fs = require("fs");
const { summarizePolicyFeedback } = require("../policy/deus-policy-feedback");
const { INTROSPECTION_POLICY } = require("../beliefs/belief-policy");
const { WORKSPACE_ROOT } = require("../workspace/workspace-path");
const { resolveMemoryPath } = require("../runtime/runtime-surface-paths");
const {
  calculateActivityStats,
  checkUncommittedChanges,
  defaultLog,
  ensureDir,
  generateDailyMemory,
  getToday,
  getYesterday,
  loadBeliefs,
  loadLogs,
  resolveIntrospectionRuntimePaths,
} = require("./introspection-runtime-state");
const { buildSummaryOutput } = require("./introspection-summary-output");
const {
  collectIntegrationMetrics,
} = require("./introspection-integration-metrics");
const {
  buildCompactSummaryLine,
  buildFollowupSurface,
  buildIntrospectionArtifactPaths,
  buildIntrospectionFollowupArtifacts,
  persistReportArtifacts,
} = require("./introspection-artifact-persistence");
const {
  buildIntrospectionReportData,
  renderIntrospectionReport,
  resolveIntrospectionReportPosture,
} = require("./introspection-report-content");

function buildReportArtifacts(context = {}, options = {}) {
  const workspaceRoot = options.workspaceRoot || WORKSPACE_ROOT;
  const runtimePaths = resolveIntrospectionRuntimePaths(workspaceRoot);
  const {
    introspectionDir = runtimePaths.introspectionDir,
    beliefsFile = runtimePaths.beliefsFile,
    logDir = runtimePaths.logDir,
    dryRun = false,
    log = defaultLog,
    aggregateLogs,
  } = options;
  const contradictionResult = context.contradictionResult || {};
  const decayAuditSurface = context.decayAuditResult?.audit || {};
  const worldModelSurface = context.worldModelResult?.worldModel || {};
  const focusStateSurface = context.worldModelResult?.focusState || {};
  const sleepPlannerSurface = context.worldModelResult?.sleepPlanner || {};
  const actionPolicySurface = context.worldModelResult?.actionPolicy || {};

  if (!dryRun) {
    ensureDir(introspectionDir);
  }

  const today = getToday();
  const yesterday = getYesterday();
  const beliefs = loadBeliefs(beliefsFile);
  const uncommitted = checkUncommittedChanges(workspaceRoot);

  generateDailyMemory({
    aggregateLogs,
    dateStr: today,
    dryRun,
    log,
    workspaceRoot,
  });

  const todayLogs = loadLogs(today, logDir);
  const yesterdayLogs = loadLogs(yesterday, logDir);
  const policyFeedback = summarizePolicyFeedback([
    ...yesterdayLogs,
    ...todayLogs,
  ]);
  const memoryToday = resolveMemoryPath(today, { workspaceRoot });
  const memoryYesterday = resolveMemoryPath(yesterday, { workspaceRoot });
  const memoryExists = {
    today: fs.existsSync(memoryToday),
    yesterday: fs.existsSync(memoryYesterday),
  };
  const activityStats = calculateActivityStats(todayLogs, yesterdayLogs);
  const uncommittedCount = uncommitted.length;
  const lowConfidence = beliefs.filter(
    (belief) => belief.confidence < INTROSPECTION_POLICY.lowConfidenceThreshold,
  );
  const coherenceScore =
    beliefs.length > 0
      ? beliefs.filter(
          (belief) =>
            belief.confidence > INTROSPECTION_POLICY.confidentBeliefThreshold,
        ).length / beliefs.length
      : 0;
  const posture = resolveIntrospectionReportPosture(
    coherenceScore,
    lowConfidence.length,
  );

  const report = renderIntrospectionReport({
    actionPolicySurface,
    activityStats,
    beliefs,
    coherenceScore,
    decayAuditSurface,
    focusStateSurface,
    lowConfidence,
    memoryExists,
    policyFeedback,
    posture,
    sleepPlannerSurface,
    today,
    todayLogs,
    uncommittedCount,
    worldModelSurface,
    yesterday,
    yesterdayLogs,
  });

  const reportData = buildIntrospectionReportData({
    actionPolicySurface,
    beliefs,
    coherenceScore,
    context: {
      ...context,
      activityStats,
    },
    contradictionResult,
    decayAuditSurface,
    focusStateSurface,
    lowConfidence,
    memoryExists,
    policyFeedback,
    sleepPlannerSurface,
    today,
    uncommittedCount,
    worldModelSurface,
  });

  const summaryLine = buildCompactSummaryLine({
    actionPolicySurface,
    activityStats,
    beliefs,
    coherenceScore,
    focusStateSurface,
    memoryExists,
    policyFeedback,
    reportData,
    sleepPlannerSurface,
    today,
    worldModelSurface,
  });

  const artifactPaths = buildIntrospectionArtifactPaths(
    introspectionDir,
    today,
    runtimePaths.summaryPath,
  );
  const followupPacket = buildIntrospectionFollowupArtifacts({
    artifactPaths,
    dryRun,
    reportData,
  });

  persistReportArtifacts({
    artifactPaths,
    dryRun,
    followupPacket,
    introspectionDir,
    log,
    report,
    reportData,
    summaryLine,
  });

  return {
    coherence: coherenceScore,
    beliefs: beliefs.length,
    memory: memoryExists,
    activity: activityStats,
    llm_needed: reportData.llm_analysis_needed,
    worldModel: worldModelSurface,
    focusState: focusStateSurface,
    sleepPlanner: sleepPlannerSurface,
    actionPolicy: actionPolicySurface,
    policyFeedback,
    artifactPaths,
    followup: buildFollowupSurface(followupPacket, artifactPaths),
    followupPacket,
    dryRun,
  };
}

module.exports = {
  buildReportArtifacts,
  buildSummaryOutput,
  collectIntegrationMetrics,
};
