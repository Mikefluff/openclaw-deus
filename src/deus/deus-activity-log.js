const fs = require("fs");
const path = require("path");
const { WORKSPACE_ROOT } = require("../workspace/workspace-path");
const {
  resolveLogPath,
  resolveLogsDir,
  resolveLogsWriteDir,
} = require("../runtime/runtime-surface-paths");
const {
  getWorkspaceDateContext,
  getWorkspaceDayKey,
} = require("../workspace/workspace-date-context");

function resolveWorkspaceActivityLogDir(options = {}) {
  const workspaceRoot = options.workspaceRoot || WORKSPACE_ROOT;
  return resolveLogsDir({ workspaceRoot });
}

function resolveWorkspaceActivityLogPath(dayKey, options = {}) {
  const resolvedDayKey = dayKey || getWorkspaceDateContext().today;
  return resolveLogPath(resolvedDayKey, {
    workspaceRoot: options.workspaceRoot,
  });
}

function resolveDayKeyFromTimestamp(timestamp) {
  if (timestamp) {
    const parsed = new Date(timestamp);
    if (!Number.isNaN(parsed.getTime())) {
      return getWorkspaceDayKey(parsed);
    }
  }

  if (typeof timestamp === "string") {
    const match = timestamp.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) {
      return match[1];
    }
  }

  return getWorkspaceDateContext().today;
}

function appendWorkspaceActivityLogEntry(options) {
  const {
    type,
    description,
    context = {},
    timestamp = new Date().toISOString(),
    agent = "DEUS",
    workspaceRoot,
    echo = true,
  } = options;
  const logPath = resolveWorkspaceActivityLogPath(
    resolveDayKeyFromTimestamp(timestamp),
    { workspaceRoot },
  );
  const entry = {
    timestamp,
    type,
    description,
    context,
    agent,
  };

  fs.mkdirSync(resolveLogsWriteDir({ workspaceRoot }), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`);

  if (echo) {
    console.log(`[DEUS LOG] ${type}: ${description}`);
  }

  return {
    entry,
    logPath,
    logFile: logPath,
  };
}

function logActivity(type, description, context = {}, options = {}) {
  return appendWorkspaceActivityLogEntry({
    type,
    description,
    context,
    timestamp: options.timestamp,
    workspaceRoot: options.workspaceRoot,
    echo: options.echo,
  });
}

function listWorkspaceActivityLogFiles(options = {}) {
  const logDir = resolveWorkspaceActivityLogDir(options);
  if (!fs.existsSync(logDir)) {
    return [];
  }

  return fs
    .readdirSync(logDir)
    .filter((file) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(file))
    .sort();
}

function readWorkspaceActivityLogEntries(options = {}) {
  const files = listWorkspaceActivityLogFiles(options);
  const selectedFiles = options.dayKey
    ? files.filter((file) => file === `${options.dayKey}.jsonl`)
    : files.slice(-(options.days || files.length));
  const entries = [];

  for (const file of selectedFiles) {
    const filePath = path.join(resolveWorkspaceActivityLogDir(options), file);
    const dayKey = file.replace(/\.jsonl$/, "");
    const fileEntries = fs
      .readFileSync(filePath, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => ({
        ...JSON.parse(line),
        dayKey,
        fileName: file,
        filePath,
      }));

    entries.push(...fileEntries);
  }

  if (options.limit) {
    return entries.slice(-options.limit);
  }

  return entries;
}

function readActivityLogEntries(dayKey, options = {}) {
  return readWorkspaceActivityLogEntries({
    ...options,
    dayKey,
  });
}

module.exports = {
  appendWorkspaceActivityLogEntry,
  listWorkspaceActivityLogFiles,
  logActivity,
  readActivityLogEntries,
  readWorkspaceActivityLogEntries,
  resolveDayKeyFromTimestamp,
  resolveWorkspaceActivityLogDir,
  resolveWorkspaceActivityLogPath,
};
