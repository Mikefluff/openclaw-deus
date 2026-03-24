"use strict";

const fs = require("fs");
const path = require("path");
const { WORKSPACE_ROOT } = require("../workspace/workspace-path");
const {
  resolveMemoryDir,
  resolveOpenTensionsPath,
  resolvePendingBeliefsPath,
  resolveReviewDir,
} = require("../runtime/runtime-surface-paths");
const { getWorkspaceDateContext } = require("../workspace/workspace-date-context");

function resolveNightlyPaths(workspaceRoot = WORKSPACE_ROOT) {
  const memoryDir = resolveMemoryDir({ workspaceRoot });
  const reviewDir = resolveReviewDir({ workspaceRoot });

  return {
    workspaceRoot,
    memoryDir,
    reviewDir,
    pendingBeliefsPath: resolvePendingBeliefsPath({ workspaceRoot }),
    openTensionsPath: resolveOpenTensionsPath({ workspaceRoot }),
  };
}

function resolveToday() {
  return getWorkspaceDateContext().today;
}

function ensureFile(file, header) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, `${header}\n\n`);
  }
}

function appendOnce(file, marker, block) {
  ensureFile(
    file,
    path.basename(file, path.extname(file)).replace(/[-_]/g, " "),
  );
  const content = fs.readFileSync(file, "utf8");
  if (!content.includes(`marker: ${marker}`)) {
    fs.appendFileSync(file, block);
    return true;
  }

  return false;
}

function readRecentMemory(limit = 7, options = {}) {
  const { memoryDir } = resolveNightlyPaths(options.workspaceRoot);
  if (!fs.existsSync(memoryDir)) {
    return [];
  }

  return fs
    .readdirSync(memoryDir)
    .filter((file) => file.endsWith(".md"))
    .sort()
    .slice(-limit)
    .map((file) => ({
      file,
      content: fs.readFileSync(path.join(memoryDir, file), "utf8"),
    }));
}

module.exports = {
  appendOnce,
  ensureFile,
  readRecentMemory,
  resolveNightlyPaths,
  resolveToday,
};
