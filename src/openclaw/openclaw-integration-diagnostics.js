const path = require("path");
const { WORKSPACE_ROOT } = require("../workspace/workspace-path");
const { readBeliefs } = require("../deus/deus-state-readers");
const { appendDeusOpsLog, resolveDeusOpsLogPath } = require("../deus/deus-ops-log");
const { readWorkspaceActivityLogEntries } = require("../deus/deus-activity-log");
const { getPolicyRuntimeSurface } = require("../policy/deus-policy-surface");

function resolveOpenClawIntegrationLogPath(options = {}) {
  return resolveDeusOpsLogPath("openclaw-integration", options);
}

function appendOpenClawIntegrationLog(message, options = {}) {
  const { entry, logPath } = appendDeusOpsLog({
    component: "openclaw-integration",
    event: options.event || "log",
    message,
    details: options.details || {},
    timestamp: options.timestamp,
    workspaceRoot: options.workspaceRoot,
    echo: false,
  });

  return {
    entry,
    logPath,
  };
}

function readOpenClawBeliefSnapshot(options = {}) {
  const workspaceRoot = options.workspaceRoot || WORKSPACE_ROOT;
  return readBeliefs({ workspaceRoot }).length;
}

function readOpenClawPolicySnapshot(options = {}) {
  const workspaceRoot = options.workspaceRoot || WORKSPACE_ROOT;
  const surface = getPolicyRuntimeSurface({
    workspaceRoot,
    now: options.now,
  });
  const sleepPlanner = surface.sleepPlanner || {};

  return {
    worldModel: surface.worldModel,
    focusState: surface.focusState,
    sleepPlanner: {
      decision: sleepPlanner.decision || null,
      recommendedMode: sleepPlanner.recommendedMode || null,
      quietHoursActive: sleepPlanner.quietHours?.active ?? false,
      nightlyWindowActive: sleepPlanner.nightlyWindow?.active ?? false,
      allowedNow: sleepPlanner.backgroundReflection?.allowedNow ?? false,
      readiness: {
        ready: sleepPlanner.readiness?.ready ?? false,
        blockers: sleepPlanner.readiness?.blockers || [],
      },
    },
    actionPolicy: {
      decision: surface.actionPolicy.decision,
      recommendedMode: surface.actionPolicy.recommendedMode,
      ripenessScore: surface.actionPolicy.ripenessScore,
      costBand: surface.actionPolicy.costBand,
      blockers: surface.actionPolicy.blockers,
    },
  };
}

function readRecentWorkspaceLogs(options = {}) {
  return readWorkspaceActivityLogEntries({
    workspaceRoot: options.workspaceRoot || WORKSPACE_ROOT,
    days: 1,
    limit: options.count || 10,
  });
}

module.exports = {
  appendOpenClawIntegrationLog,
  readOpenClawBeliefSnapshot,
  readOpenClawPolicySnapshot,
  readRecentWorkspaceLogs,
  resolveOpenClawIntegrationLogPath,
};
