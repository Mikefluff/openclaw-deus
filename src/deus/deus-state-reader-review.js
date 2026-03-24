"use strict";

const {
  resolveIntrospectionSummaryPath,
  resolveOpenTensionsPath,
  resolvePendingBeliefsPath,
} = require("../runtime/runtime-surface-paths");
const {
  parseJsonl,
  readTextFile,
} = require("./deus-state-reader-files");
const { resolveWorkspaceRoot } = require("./deus-state-reader-paths");

function readReviewDocument(filePath) {
  const raw = readTextFile(filePath);
  const markers = raw
    ? Array.from(raw.matchAll(/^- marker:\s*(.+)$/gm), (match) =>
        match[1].trim(),
      )
    : [];

  return {
    exists: raw !== null,
    path: filePath,
    raw: raw || "",
    markers,
  };
}

function readPendingBeliefs(options = {}) {
  const workspaceRoot = resolveWorkspaceRoot(options);
  return readReviewDocument(resolvePendingBeliefsPath({ workspaceRoot }));
}

function readOpenTensions(options = {}) {
  const workspaceRoot = resolveWorkspaceRoot(options);
  return readReviewDocument(resolveOpenTensionsPath({ workspaceRoot }));
}

function readLatestIntrospectionSummary(options = {}) {
  const workspaceRoot = resolveWorkspaceRoot(options);
  const summaryPath = resolveIntrospectionSummaryPath({ workspaceRoot });
  const summaries = parseJsonl(readTextFile(summaryPath));
  const latestSummary =
    summaries.length > 0 ? summaries[summaries.length - 1] : null;

  return {
    exists: latestSummary !== null,
    path: summaryPath,
    summary: latestSummary,
  };
}

module.exports = {
  readLatestIntrospectionSummary,
  readOpenTensions,
  readPendingBeliefs,
  readReviewDocument,
};
