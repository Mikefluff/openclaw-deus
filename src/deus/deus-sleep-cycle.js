const { appendDeusOpsLog } = require("./deus-ops-log");
const {
  assertBackgroundMutationTargets,
} = require("../policy/deus-background-mutation-policy");
const {
  runNightlyMemoryConsolidation,
} = require("./deus-nightly-consolidation");
const {
  SLEEP_CYCLE_ALLOWED_WRITE_TARGETS,
  SLEEP_CYCLE_FORBIDDEN_WRITE_TARGETS,
  resolvePlannedSleepCycleTargets,
} = require("./deus-sleep-cycle-targets");
const {
  runSleepIntrospection,
  summarizeSleepIntrospectionResult,
} = require("./deus-sleep-cycle-introspection");
const { buildSleepCycleState } = require("./deus-sleep-cycle-state");

function buildDryRunSleepCycleSummary(result) {
  if (result.status === "ready") {
    return "dry-run sleep cycle is eligible now and produced bounded reflection previews";
  }

  if (result.status === "blocked") {
    return "dry-run sleep cycle inspected the workspace but would first need readiness preparation";
  }

  return "dry-run sleep cycle inspected the workspace and would not run at this time";
}

function buildMutatingSleepCycleSummary(result) {
  if (result.status === "ready") {
    return "bounded sleep cycle ran and only touched logs, memory, review, and introspection surfaces";
  }

  if (result.status === "blocked") {
    return "bounded sleep cycle stayed in preparation mode and only recorded the blocked state";
  }

  return "bounded sleep cycle did not run because the current planner state is not eligible";
}

function runDrySleepCycle(options = {}) {
  const state = buildSleepCycleState(options);
  const result = {
    dryRun: true,
    status: state.status,
    summary: "",
    planner: state.planner,
    inputs: state.inputs,
    previews: state.previews,
  };

  result.summary = buildDryRunSleepCycleSummary(result);
  return result;
}

function runSleepCycle(options = {}) {
  const state = buildSleepCycleState({
    ...options,
    includeIntrospectionPreview: false,
  });
  const logSleepCycle =
    options.logSleepCycle ||
    ((details) =>
      appendDeusOpsLog({
        component: "sleep-cycle",
        workspaceRoot: options.workspaceRoot,
        echo: options.echo ?? false,
        ...details,
      }));
  const runConsolidation =
    options.runNightlyMemoryConsolidation || runNightlyMemoryConsolidation;
  const runIntrospection = options.runIntrospection || runSleepIntrospection;
  const plannedTargets =
    options.plannedTargets || resolvePlannedSleepCycleTargets(options);
  const result = {
    dryRun: false,
    status: state.status,
    summary: "",
    planner: state.planner,
    inputs: state.inputs,
    previews: state.previews,
    mutations: {
      ran: false,
      allowedWriteTargets: [...SLEEP_CYCLE_ALLOWED_WRITE_TARGETS],
      forbiddenWriteTargets: [...SLEEP_CYCLE_FORBIDDEN_WRITE_TARGETS],
      plannedTargets,
      consolidation: null,
      introspection: null,
      auditLog: null,
    },
  };

  if (state.status !== "ready") {
    const auditEntry = logSleepCycle({
      event: "sleep_cycle_not_run",
      message: `Sleep cycle ${state.status}: ${state.planner.summary || "planner blocked execution"}`,
      details: {
        status: state.status,
        decision: state.planner.decision || null,
        recommendedMode: state.planner.recommendedMode || null,
      },
    });
    result.mutations.auditLog = {
      logPath: auditEntry.logPath,
      event: auditEntry.entry.event,
    };
    result.summary = buildMutatingSleepCycleSummary(result);
    return result;
  }

  assertBackgroundMutationTargets(plannedTargets, {
    workspaceRoot: options.workspaceRoot,
    origin: "sleep",
  });
  const startAudit = logSleepCycle({
    event: "sleep_cycle_started",
    message: "Starting bounded sleep reflection cycle",
    details: {
      decision: state.planner.decision || null,
      recommendedMode: state.planner.recommendedMode || null,
    },
  });
  const consolidationResult = runConsolidation({
    workspaceRoot: options.workspaceRoot,
  });
  const introspectionResult = runIntrospection({
    ...options,
    dryRun: false,
  });
  const finishAudit = logSleepCycle({
    event: "sleep_cycle_completed",
    message: "Completed bounded sleep reflection cycle",
    details: {
      recurringPatterns: consolidationResult.recurring_patterns,
      policyPatterns: consolidationResult.policy_recurring_patterns,
      introspectionStatus:
        introspectionResult.summary?.pipelineStatus || "unknown",
    },
  });

  result.mutations.ran = true;
  result.mutations.consolidation = consolidationResult;
  result.mutations.introspection =
    summarizeSleepIntrospectionResult(introspectionResult);
  result.mutations.auditLog = {
    started: startAudit.logPath,
    completed: finishAudit.logPath,
  };
  result.summary = buildMutatingSleepCycleSummary(result);
  return result;
}

module.exports = {
  SLEEP_CYCLE_ALLOWED_WRITE_TARGETS,
  SLEEP_CYCLE_FORBIDDEN_WRITE_TARGETS,
  buildMutatingSleepCycleSummary,
  buildDryRunSleepCycleSummary,
  buildSleepCycleState,
  resolvePlannedSleepCycleTargets,
  runDrySleepCycle,
  runSleepCycle,
};
