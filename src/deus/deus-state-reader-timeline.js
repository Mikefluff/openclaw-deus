"use strict";

const path = require("path");

const {
  resolveBeliefsPath,
  resolveLogsDir,
  resolveMemoryDir,
} = require("../runtime/runtime-surface-paths");
const {
  DAY_FILE_PATTERNS,
  listMatchingFiles,
  parseJsonl,
  readTextFile,
} = require("./deus-state-reader-files");
const { resolveWorkspaceRoot } = require("./deus-state-reader-paths");

function readBeliefs(options = {}) {
  const workspaceRoot = resolveWorkspaceRoot(options);
  const beliefsPath = resolveBeliefsPath({ workspaceRoot });
  const content = readTextFile(beliefsPath);
  return parseJsonl(content);
}

function readRecentMemory(options = {}) {
  const workspaceRoot = resolveWorkspaceRoot(options);
  const limit = options.limit || 7;
  const memoryDir = resolveMemoryDir({ workspaceRoot });
  const files = listMatchingFiles(memoryDir, DAY_FILE_PATTERNS.memory).slice(
    -limit,
  );

  return files.reverse().map((fileName) => {
    const filePath = path.join(memoryDir, fileName);
    return {
      dayKey: fileName.replace(/\.md$/, ""),
      fileName,
      filePath,
      content: readTextFile(filePath) || "",
    };
  });
}

function readRecentLogs(options = {}) {
  const workspaceRoot = resolveWorkspaceRoot(options);
  const fileLimit = options.fileLimit || 7;
  const entryLimit = options.limit || 50;
  const logsDir = resolveLogsDir({ workspaceRoot });
  const files = listMatchingFiles(logsDir, DAY_FILE_PATTERNS.logs).slice(
    -fileLimit,
  );
  const entries = [];

  for (const fileName of files) {
    const filePath = path.join(logsDir, fileName);
    const dayKey = fileName.replace(/\.jsonl$/, "");

    for (const entry of parseJsonl(readTextFile(filePath))) {
      entries.push({
        ...entry,
        dayKey,
        fileName,
        filePath,
      });
    }
  }

  return entries.slice(-entryLimit);
}

module.exports = {
  readBeliefs,
  readRecentLogs,
  readRecentMemory,
};
