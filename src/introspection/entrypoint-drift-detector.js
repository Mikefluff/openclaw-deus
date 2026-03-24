const fs = require("fs");
const path = require("path");
const { WORKSPACE_ROOT } = require("../workspace/workspace-path");
const { DEFAULT_BOOTSTRAP_ENTRYPOINTS } = require("../deus/deus-bootstrap-contract");

function readEntrypointSnapshot(options = {}) {
  const workspaceRoot = options.workspaceRoot || WORKSPACE_ROOT;
  const files = options.files || DEFAULT_BOOTSTRAP_ENTRYPOINTS;

  return files.map((relativePath) => {
    const fullPath = path.join(workspaceRoot, relativePath);

    try {
      const stats = fs.statSync(fullPath);
      return {
        relativePath,
        exists: true,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
      };
    } catch {
      return {
        relativePath,
        exists: false,
        size: null,
        mtimeMs: null,
      };
    }
  });
}

function detectEntrypointDrift(beforeSnapshot, afterSnapshot) {
  const afterByPath = new Map(
    afterSnapshot.map((entry) => [entry.relativePath, entry]),
  );
  const changes = [];

  for (const beforeEntry of beforeSnapshot) {
    const afterEntry = afterByPath.get(beforeEntry.relativePath) || {
      relativePath: beforeEntry.relativePath,
      exists: false,
      size: null,
      mtimeMs: null,
    };

    if (beforeEntry.exists && !afterEntry.exists) {
      changes.push({
        relativePath: beforeEntry.relativePath,
        type: "missing",
      });
      continue;
    }

    if (!beforeEntry.exists && afterEntry.exists) {
      changes.push({
        relativePath: beforeEntry.relativePath,
        type: "created",
      });
      continue;
    }

    if (
      beforeEntry.exists &&
      afterEntry.exists &&
      (beforeEntry.size !== afterEntry.size ||
        beforeEntry.mtimeMs !== afterEntry.mtimeMs)
    ) {
      changes.push({
        relativePath: beforeEntry.relativePath,
        type: "modified",
      });
    }
  }

  return {
    detected: changes.length > 0,
    changes,
    summary:
      changes.length > 0
        ? changes
            .map((change) => `${change.relativePath} ${change.type}`)
            .join(", ")
        : "none detected",
  };
}

module.exports = {
  DEFAULT_BOOTSTRAP_ENTRYPOINTS,
  detectEntrypointDrift,
  readEntrypointSnapshot,
};
