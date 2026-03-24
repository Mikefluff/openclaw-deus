"use strict";

const {
  FULL_INTROSPECTION_STAGE_NAMES,
  INTROSPECTION_STAGE_NAMES,
  SLEEP_INTROSPECTION_STAGE_NAMES,
  resolveIntrospectionStageNames,
} = require("./introspection-stage-profile");
const {
  buildReportArtifacts,
  buildSummaryOutput,
  collectIntegrationMetrics,
} = require("./introspection-report-builder");
const {
  checkUncommittedChanges,
  defaultLog,
  generateDailyMemory,
  parsePorcelainStatusEntries,
  resolveIntrospectionRuntimePaths,
  shouldRunDecay,
} = require("./introspection-runtime-state");
const {
  createIntrospectionStages,
  resolveIntrospectionPipelineOptions,
} = require("./introspection-pipeline-defaults");
const {
  createInitialIntrospectionContext,
  runIntrospectionStages,
} = require("./introspection-stage-runner");

function runIntrospectionPipeline(options = {}) {
  const resolvedOptions = resolveIntrospectionPipelineOptions(options);
  const stages = resolvedOptions.stages || createIntrospectionStages(resolvedOptions);
  const context = runIntrospectionStages(
    stages,
    createInitialIntrospectionContext(resolvedOptions),
  );
  const summary = context.summary || buildSummaryOutput(context);

  return {
    summary,
    executedStages: context.executedStages,
    stageOutputs: context.stageOutputs,
    context: {
      ...context,
      summary,
    },
  };
}

function main(options = {}) {
  const result = runIntrospectionPipeline(options);
  console.log(JSON.stringify(result.summary, null, 2));
  return result.summary;
}

module.exports = {
  FULL_INTROSPECTION_STAGE_NAMES,
  INTROSPECTION_STAGE_NAMES,
  SLEEP_INTROSPECTION_STAGE_NAMES,
  buildReportArtifacts,
  buildSummaryOutput,
  checkUncommittedChanges,
  collectIntegrationMetrics,
  createIntrospectionStages,
  defaultLog,
  generateDailyMemory,
  main,
  parsePorcelainStatusEntries,
  resolveIntrospectionPipelineOptions,
  resolveIntrospectionRuntimePaths,
  resolveIntrospectionStageNames,
  runIntrospectionPipeline,
  runIntrospectionStages,
  shouldRunDecay,
};
