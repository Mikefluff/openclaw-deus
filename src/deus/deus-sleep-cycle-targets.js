const path = require("path");
const {
  resolveBeliefsPath,
  resolveIntrospectionDir,
  resolveIntrospectionSummaryWritePath,
  resolveLogsDir,
  resolveMemoryWritePath,
} = require("../runtime/runtime-surface-paths");
const {
  BACKGROUND_MUTATION_POLICY,
} = require("../policy/deus-background-mutation-policy");
const { resolveNightlyPaths } = require("./deus-nightly-consolidation");
const { resolveDeusOpsLogPath } = require("./deus-ops-log");
const { resolveWorkspaceActivityLogPath } = require("./deus-activity-log");
const {
  resolveOpenClawIntegrationLogPath,
} = require("../openclaw/openclaw-integration-diagnostics");
const {
  getDailyWorldModelPath,
  getLatestWorldModelPath,
} = require("../world-model/world-model-store");
const { getWorkspaceDayKey } = require("../workspace/workspace-date-context");

const SLEEP_CYCLE_ALLOWED_WRITE_TARGETS =
  BACKGROUND_MUTATION_POLICY.allowedPrefixes;
const SLEEP_CYCLE_FORBIDDEN_WRITE_TARGETS =
  BACKGROUND_MUTATION_POLICY.forbiddenPaths;

function buildWorkspaceScopedIntrospectionOptions(options = {}) {
  if (!options.workspaceRoot) {
    return {};
  }

  return {
    workspaceRoot: options.workspaceRoot,
    introspectionDir: resolveIntrospectionDir({
      workspaceRoot: options.workspaceRoot,
    }),
    beliefsFile: resolveBeliefsPath({ workspaceRoot: options.workspaceRoot }),
    logDir: resolveLogsDir({ workspaceRoot: options.workspaceRoot }),
  };
}

function resolveSleepCycleDayKey(options = {}) {
  return getWorkspaceDayKey(options.now || new Date());
}

function resolvePlannedSleepCycleTargets(options = {}) {
  const scopedOptions = buildWorkspaceScopedIntrospectionOptions(options);
  const dayKey = resolveSleepCycleDayKey(options);
  const nightlyPaths = resolveNightlyPaths(options.workspaceRoot);
  const introspectionDir =
    scopedOptions.introspectionDir ||
    resolveIntrospectionDir({
      workspaceRoot: options.workspaceRoot,
    });

  return [
    resolveDeusOpsLogPath("sleep-cycle", {
      workspaceRoot: options.workspaceRoot,
    }),
    resolveOpenClawIntegrationLogPath({ workspaceRoot: options.workspaceRoot }),
    resolveWorkspaceActivityLogPath(dayKey, {
      workspaceRoot: options.workspaceRoot,
    }),
    nightlyPaths.pendingBeliefsPath,
    nightlyPaths.openTensionsPath,
    resolveMemoryWritePath(dayKey, {
      workspaceRoot: options.workspaceRoot,
    }),
    getLatestWorldModelPath({ workspaceRoot: options.workspaceRoot }),
    getDailyWorldModelPath(dayKey, { workspaceRoot: options.workspaceRoot }),
    path.join(introspectionDir, `introspection-${dayKey}.md`),
    path.join(introspectionDir, `introspection-${dayKey}.json`),
    resolveIntrospectionSummaryWritePath({
      workspaceRoot: options.workspaceRoot,
    }),
  ];
}

module.exports = {
  SLEEP_CYCLE_ALLOWED_WRITE_TARGETS,
  SLEEP_CYCLE_FORBIDDEN_WRITE_TARGETS,
  buildWorkspaceScopedIntrospectionOptions,
  resolvePlannedSleepCycleTargets,
  resolveSleepCycleDayKey,
};
