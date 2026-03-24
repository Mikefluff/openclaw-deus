const fs = require("fs");
const path = require("path");
const { resolveDiagnosticsDir } = require("../runtime/runtime-diagnostics");

function normalizeComponentName(component) {
  return String(component)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");
}

function resolveDeusOpsLogDir(options = {}) {
  return path.join(resolveDiagnosticsDir(options), "deus", "ops");
}

function resolveDeusOpsLogPath(component, options = {}) {
  const logDir = options.logDir || resolveDeusOpsLogDir(options);
  return path.join(logDir, `${normalizeComponentName(component)}.jsonl`);
}

function appendDeusOpsLog(options) {
  const {
    component,
    event = "log",
    message,
    details = {},
    timestamp = new Date().toISOString(),
    workspaceRoot,
    echo = true,
  } = options;
  const logPath = resolveDeusOpsLogPath(component, { workspaceRoot });
  const entry = {
    ts: timestamp,
    component: normalizeComponentName(component),
    event,
    message,
    details,
  };

  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`);

  if (echo) {
    console.log(`[${entry.component}] ${message}`);
  }

  return {
    entry,
    logPath,
  };
}

function readDeusOpsLogEntries(component, options = {}) {
  const logPath = resolveDeusOpsLogPath(component, options);
  if (!fs.existsSync(logPath)) {
    return [];
  }

  const entries = fs
    .readFileSync(logPath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  if (!options.limit) {
    return entries;
  }

  return entries.slice(-options.limit);
}

module.exports = {
  appendDeusOpsLog,
  normalizeComponentName,
  readDeusOpsLogEntries,
  resolveDeusOpsLogDir,
  resolveDeusOpsLogPath,
};
