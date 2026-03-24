const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { aggregateAll } = require("../memory/daily-memory-aggregation");
const { resolveDeusOpsLogPath } = require("../deus/deus-ops-log");
const { WORKSPACE_ROOT } = require("../workspace/workspace-path");
const {
  resolveBeliefsPath,
  resolveIntrospectionDir,
  resolveIntrospectionSummaryWritePath,
  resolveLogsDir,
  resolveMemoryDir,
} = require("../runtime/runtime-surface-paths");
const {
  getWorkspaceDateContext,
  shiftWorkspaceDayKey,
} = require("../workspace/workspace-date-context");

function defaultLog(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function getToday() {
  return getWorkspaceDateContext().today;
}

function getYesterday() {
  return shiftWorkspaceDayKey(new Date(), -1);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function resolveIntrospectionRuntimePaths(workspaceRoot = WORKSPACE_ROOT) {
  return {
    memoryDir: resolveMemoryDir({ workspaceRoot }),
    introspectionDir: resolveIntrospectionDir({ workspaceRoot }),
    beliefsFile: resolveBeliefsPath({ workspaceRoot }),
    logDir: resolveLogsDir({ workspaceRoot }),
    summaryPath: resolveIntrospectionSummaryWritePath({ workspaceRoot }),
    decayLogPath: resolveDeusOpsLogPath("belief-decay", { workspaceRoot }),
  };
}

function loadBeliefs(
  beliefsFile = resolveBeliefsPath({ workspaceRoot: WORKSPACE_ROOT }),
) {
  try {
    const data = fs.readFileSync(beliefsFile, "utf8");
    return data
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function parsePorcelainStatusEntries(output) {
  if (!output) {
    return [];
  }

  return output.split("\u0000").filter((entry) => entry.length > 0);
}

function checkUncommittedChanges(
  workspaceRoot = WORKSPACE_ROOT,
  runCommand = execSync,
) {
  try {
    const output = runCommand(
      "git status --porcelain -z --untracked-files=no",
      {
        cwd: workspaceRoot,
      },
    ).toString();

    return parsePorcelainStatusEntries(output);
  } catch {
    return [];
  }
}

function loadLogs(
  date,
  logDir = resolveLogsDir({ workspaceRoot: WORKSPACE_ROOT }),
) {
  const logFile = path.join(logDir, `${date}.jsonl`);
  if (!fs.existsSync(logFile)) {
    return [];
  }

  const data = fs.readFileSync(logFile, "utf8");
  return data
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function calculateActivityStats(todayLogs, yesterdayLogs) {
  const activityStats = {
    today: todayLogs.length,
    yesterday: yesterdayLogs.length,
    byType: {},
  };

  todayLogs.forEach((entry) => {
    activityStats.byType[entry.type] =
      (activityStats.byType[entry.type] || 0) + 1;
  });

  return activityStats;
}

function shouldRunDecay(
  decayLogPath = resolveIntrospectionRuntimePaths().decayLogPath,
  now = new Date(),
) {
  if (!fs.existsSync(decayLogPath)) {
    return true;
  }

  return (
    fs.statSync(decayLogPath).mtime <
    new Date(now.getTime() - 20 * 60 * 60 * 1000)
  );
}

function generateDailyMemory(options = {}) {
  const {
    dateStr = getToday(),
    dryRun = false,
    log = defaultLog,
    aggregateLogs = aggregateAll,
    workspaceRoot = WORKSPACE_ROOT,
  } = options;

  if (dryRun) {
    log("Skipping DEUS activity log aggregation in dry-run mode");
    return { skipped: true };
  }

  log("Aggregating DEUS activity logs...");
  aggregateLogs(dateStr, { workspaceRoot });
  return { skipped: false };
}

module.exports = {
  calculateActivityStats,
  checkUncommittedChanges,
  defaultLog,
  ensureDir,
  generateDailyMemory,
  getToday,
  getYesterday,
  loadBeliefs,
  loadLogs,
  parsePorcelainStatusEntries,
  resolveIntrospectionRuntimePaths,
  shouldRunDecay,
};
