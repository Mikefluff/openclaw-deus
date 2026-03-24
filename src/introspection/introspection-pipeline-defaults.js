"use strict";

const { main: extractBeliefsMain } = require("../beliefs/belief-extractor");
const {
  main: checkContradictionsMain,
} = require("../beliefs/belief-contradictions");
const { main: applyDecayMain } = require("../beliefs/belief-decay");
const openclawIntegration = require("../openclaw/openclaw-integration");
const { refreshPolicyRuntimeSurface } = require("../policy/deus-policy-surface");
const { WORKSPACE_ROOT } = require("../workspace/workspace-path");
const {
  defaultLog,
  loadBeliefs,
  resolveIntrospectionRuntimePaths,
  shouldRunDecay,
} = require("./introspection-runtime-state");
const {
  resolveIntrospectionStageNames,
} = require("./introspection-stage-profile");
const {
  createIntrospectionStageRegistry,
} = require("./introspection-stage-registry");

function resolveIntrospectionPipelineOptions(options = {}) {
  const envDryRun =
    process.env.INTROSPECTION_DRY_RUN === "1" ||
    process.env.INTROSPECTION_DRY_RUN === "true";
  const dryRun = options.dryRun ?? envDryRun;
  const profile = options.profile || "full";
  const stageNames = options.stageNames || resolveIntrospectionStageNames(profile);
  const log = options.log || defaultLog;
  const workspaceRoot = options.workspaceRoot || WORKSPACE_ROOT;
  const now = options.now || new Date();

  return {
    ...options,
    dryRun,
    log,
    now,
    profile,
    stageNames,
    workspaceRoot,
    openclaw: options.openclaw || openclawIntegration,
    extractBeliefs: options.extractBeliefs || extractBeliefsMain,
    checkContradictions:
      options.checkContradictions || checkContradictionsMain,
    applyDecay: options.applyDecay || applyDecayMain,
    loadBeliefsFile: options.loadBeliefsFile || loadBeliefs,
    refreshPolicySurface:
      options.refreshPolicySurface || refreshPolicyRuntimeSurface,
    shouldRunDecayCheck: options.shouldRunDecayCheck || shouldRunDecay,
    runtimePaths:
      options.runtimePaths || resolveIntrospectionRuntimePaths(workspaceRoot),
  };
}

function createIntrospectionStages(options = {}) {
  const resolvedOptions = resolveIntrospectionPipelineOptions(options);
  const stageRegistry = createIntrospectionStageRegistry(resolvedOptions);

  return resolvedOptions.stageNames.map((stageName) => {
    const stage = stageRegistry[stageName];
    if (!stage) {
      throw new Error(`Unknown introspection stage: ${stageName}`);
    }
    return stage;
  });
}

module.exports = {
  createIntrospectionStages,
  resolveIntrospectionPipelineOptions,
};
