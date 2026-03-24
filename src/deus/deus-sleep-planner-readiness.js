"use strict";

function buildWorkspaceReadiness(options = {}) {
  const beliefs = options.beliefs || [];
  const recentMemory = options.recentMemory || [];
  const recentLogs = options.recentLogs || [];
  const introspection = options.introspection || {};
  const focusState = options.focusState || {};
  const statusState = options.statusState || {};

  const signals = {
    statusReadable: statusState.exists !== false,
    focusStateValid: focusState.valid !== false,
    beliefsAvailable: beliefs.length > 0,
    recentMemoryAvailable: recentMemory.length > 0,
    recentLogsAvailable: recentLogs.length > 0,
    introspectionHistoryAvailable: Boolean(introspection.summary),
  };

  const blockers = [];
  if (!signals.statusReadable) {
    blockers.push("missing_status_file");
  }
  if (!signals.focusStateValid) {
    blockers.push("invalid_focus_state");
  }
  if (!signals.beliefsAvailable) {
    blockers.push("missing_beliefs");
  }
  if (!signals.recentMemoryAvailable && !signals.recentLogsAvailable) {
    blockers.push("missing_recent_evidence");
  }

  const score =
    Object.values(signals).filter(Boolean).length / Object.keys(signals).length;

  return {
    ready: blockers.length === 0,
    score: Number(score.toFixed(2)),
    blockers,
    signals,
  };
}

module.exports = {
  buildWorkspaceReadiness,
};
