const {
  readBeliefs,
  readLatestIntrospectionSummary,
  readOpenTensions,
  readPendingBeliefs,
  readProjectsSnapshot,
  readRecentLogs,
  readRecentMemory,
  readStatusState,
} = require("../deus/deus-state-readers");
const { getWorkspaceDateContext } = require("../workspace/workspace-date-context");
const { normalizeWorldModel } = require("./world-model-schema");
const { WORLD_MODEL_POLICY } = require("../policy/action-policy-config");
const { summarizeTrackedRepoState } = require("./world-model-repo-state");
const {
  calculateWorldModelConfidence,
  deriveActiveLimitations,
  deriveActiveRisks,
  deriveHardBlocks,
  deriveHumanPreferences,
  derivePreferredModes,
  deriveReviewPressure,
  deriveWaitingConditions,
  getMemoryFreshnessDays,
  resolveFocusState,
  selectBeliefs,
} = require("./world-model-derivations");

function buildWorldModel(options = {}) {
  const workspaceRoot = options.workspaceRoot;
  const dateContext = getWorkspaceDateContext(options.now);
  const beliefs = readBeliefs({ workspaceRoot });
  const memoryEntries = readRecentMemory({
    workspaceRoot,
    limit: WORLD_MODEL_POLICY.recentMemoryWindowDays,
  });
  const logEntries = readRecentLogs({
    workspaceRoot,
    limit: WORLD_MODEL_POLICY.recentLogEntryLimit,
  });
  const statusState = readStatusState({ workspaceRoot });
  const focusState = resolveFocusState(statusState);
  const pendingBeliefs = readPendingBeliefs({ workspaceRoot });
  const openTensions = readOpenTensions({ workspaceRoot });
  const introspection = readLatestIntrospectionSummary({ workspaceRoot });
  const projectsSnapshot = readProjectsSnapshot({ workspaceRoot });
  const repoState = summarizeTrackedRepoState(
    workspaceRoot,
    options.runCommand,
  );
  const memoryFreshnessDays = getMemoryFreshnessDays(
    memoryEntries,
    dateContext,
  );
  const hardBlocks = deriveHardBlocks(
    statusState,
    introspection,
    memoryFreshnessDays,
  );

  return normalizeWorldModel({
    version: 1,
    generated_at: dateContext.nowIso,
    workspace_day: dateContext.today,
    confidence: calculateWorldModelConfidence({
      beliefs,
      memoryEntries,
      logEntries,
      statusState,
      pendingBeliefs,
      openTensions,
      introspection,
      repoState,
    }),
    self_model: {
      agency_level: "L2+",
      invariants: selectBeliefs(beliefs, /^I\d+$/),
      goals: selectBeliefs(beliefs, /^G\d+$/),
      review_pressure: deriveReviewPressure(
        beliefs,
        pendingBeliefs,
        openTensions,
      ),
      active_limitations: deriveActiveLimitations(
        statusState,
        introspection,
        memoryEntries,
      ),
    },
    human_model: {
      preferences: deriveHumanPreferences(beliefs),
      constraints: openTensions.markers,
      active_requests: [focusState.goal, focusState.next_step].filter(Boolean),
    },
    workspace_model: {
      active_project: focusState.active_project,
      mode: focusState.mode,
      status: focusState.status,
      repo_dirty: repoState.dirty,
      repo_changes: repoState.changes,
      memory_freshness_days: memoryFreshnessDays,
      introspection_date: introspection.summary?.date || null,
      recurring_patterns: pendingBeliefs.markers,
      next_step: focusState.next_step,
      waiting_for: focusState.waiting_for,
      follow_through_required: focusState.follow_through_required,
    },
    environment_model: {
      waiting_conditions: deriveWaitingConditions(statusState),
      dependencies: [],
      open_tensions: openTensions.markers,
      external_systems: projectsSnapshot.exists ? ["projects_workspace"] : [],
    },
    action_priors: {
      hard_blocks: hardBlocks,
      preferred_modes: derivePreferredModes(statusState, hardBlocks),
      active_risks: deriveActiveRisks(
        statusState,
        openTensions,
        repoState,
        memoryFreshnessDays,
      ),
    },
    sources: {
      beliefs: {
        count: beliefs.length,
      },
      memory: {
        days: memoryEntries.length,
        latest_day: memoryEntries[0]?.dayKey || null,
      },
      logs: {
        entries: logEntries.length,
        latest_day: logEntries[logEntries.length - 1]?.dayKey || null,
      },
      pending_beliefs: {
        count: pendingBeliefs.markers.length,
        markers: pendingBeliefs.markers,
      },
      open_tensions: {
        count: openTensions.markers.length,
        markers: openTensions.markers,
      },
      status: {
        exists: statusState.exists,
      },
      projects: {
        exists: projectsSnapshot.exists,
      },
      introspection: {
        exists: Boolean(introspection.summary),
        date: introspection.summary?.date || null,
      },
    },
  });
}

module.exports = {
  buildWorldModel,
  calculateWorldModelConfidence,
  deriveActiveRisks,
  deriveHardBlocks,
  derivePreferredModes,
  summarizeTrackedRepoState,
};
