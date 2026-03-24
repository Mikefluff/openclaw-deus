const {
  buildReportArtifacts,
  createIntrospectionStages,
  runIntrospectionPipeline,
  SLEEP_INTROSPECTION_STAGE_NAMES,
} = require("../introspection/introspection-pipeline");
const { OpenClawIntegration } = require("../openclaw/openclaw-integration");
const {
  buildWorkspaceScopedIntrospectionOptions,
} = require("./deus-sleep-cycle-targets");

function runSleepIntrospection(options = {}) {
  const scopedOptions = buildWorkspaceScopedIntrospectionOptions(options);
  const openclaw =
    options.openclaw ||
    new OpenClawIntegration({ workspaceRoot: options.workspaceRoot });
  const stages = createIntrospectionStages({
    ...options,
    ...scopedOptions,
    profile: "sleep",
    openclaw,
    reportBuilder: (context, stageOptions = {}) =>
      buildReportArtifacts(context, {
        ...stageOptions,
        ...scopedOptions,
      }),
  });

  return runIntrospectionPipeline({
    ...options,
    ...scopedOptions,
    profile: "sleep",
    stages,
  });
}

function summarizeSleepIntrospectionResult(introspectionResult) {
  if (!introspectionResult) {
    return null;
  }

  return {
    profile: introspectionResult.summary?.introspectionProfile || "sleep",
    executedStages:
      introspectionResult.summary?.executedStages ||
      SLEEP_INTROSPECTION_STAGE_NAMES,
    pipelineStatus: introspectionResult.summary?.pipelineStatus || null,
    coherence: introspectionResult.summary?.coherence ?? null,
    sleepPlannerDecision:
      introspectionResult.summary?.sleepPlanner?.decision || null,
  };
}

module.exports = {
  runSleepIntrospection,
  summarizeSleepIntrospectionResult,
};
