const fs = require("fs").promises;
const path = require("path");
const { WORKSPACE_ROOT } = require("../workspace/workspace-path");

const DEFAULT_DIAGNOSTICS_HISTORY_LIMIT = 10;

function resolveDiagnosticsDir(options = {}) {
  const workspaceRoot = options.workspaceRoot || WORKSPACE_ROOT;
  const configured =
    options.diagnosticsDir ||
    process.env.WORKSPACE_DIAGNOSTICS_DIR ||
    process.env.OPENCLAW_DIAGNOSTICS_DIR;

  if (!configured) {
    return path.join(workspaceRoot, ".tmp", "diagnostics");
  }

  return path.isAbsolute(configured)
    ? configured
    : path.join(workspaceRoot, configured);
}

function resolveDiagnosticPaths(name, options = {}) {
  const diagnosticsDir = resolveDiagnosticsDir(options);

  return {
    diagnosticsDir,
    latestPath: path.join(diagnosticsDir, `${name}.json`),
    historyDir: path.join(diagnosticsDir, "history", name),
  };
}

async function pruneDiagnosticHistory(options = {}) {
  const historyDir = options.historyDir;
  const historyLimit =
    options.historyLimit || DEFAULT_DIAGNOSTICS_HISTORY_LIMIT;

  const entries = (await fs.readdir(historyDir).catch(() => []))
    .filter((entry) => entry.endsWith(".json"))
    .sort()
    .reverse();
  const staleEntries = entries.slice(historyLimit);

  await Promise.all(
    staleEntries.map((entry) =>
      fs.unlink(path.join(historyDir, entry)).catch(() => {}),
    ),
  );

  return {
    kept: Math.min(entries.length, historyLimit),
    pruned: staleEntries.length,
  };
}

async function writeDiagnosticSnapshot(options) {
  const {
    name,
    payload,
    keepHistory = true,
    historyLimit = DEFAULT_DIAGNOSTICS_HISTORY_LIMIT,
    timestamp = new Date(),
  } = options;

  const { latestPath, historyDir } = resolveDiagnosticPaths(name, options);
  const serialized = JSON.stringify(payload, null, 2);

  await fs.mkdir(path.dirname(latestPath), { recursive: true });
  await fs.writeFile(latestPath, serialized);

  if (!keepHistory) {
    return {
      latestPath,
      historyDir,
      snapshotPath: null,
      history: { kept: 0, pruned: 0 },
    };
  }

  await fs.mkdir(historyDir, { recursive: true });

  const snapshotName = `${timestamp.toISOString().replace(/[:.]/g, "-")}.json`;
  const snapshotPath = path.join(historyDir, snapshotName);
  await fs.writeFile(snapshotPath, serialized);

  const history = await pruneDiagnosticHistory({
    historyDir,
    historyLimit,
  });

  return {
    latestPath,
    historyDir,
    snapshotPath,
    history,
  };
}

module.exports = {
  DEFAULT_DIAGNOSTICS_HISTORY_LIMIT,
  pruneDiagnosticHistory,
  resolveDiagnosticPaths,
  resolveDiagnosticsDir,
  writeDiagnosticSnapshot,
};
