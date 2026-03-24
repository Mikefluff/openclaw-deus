"use strict";

function isRootMarkdown(filePath) {
  return /^[^/]+\.md$/u.test(filePath);
}

function isProjectDataPath(filePath) {
  return /^projects\/[^/]+\/data(?:\/|$)/u.test(filePath);
}

function isProjectLogPath(filePath) {
  return /^projects\/[^/]+\/logs(?:\/|$)/u.test(filePath);
}

function isProjectStatusPath(filePath) {
  return /^projects\/[^/]+\/STATUS\.md$/u.test(filePath);
}

function isDailyMemoryPath(filePath) {
  return /^memory\/\d{4}-\d{2}-\d{2}\.md$/u.test(filePath);
}

function isRuntimeLogPath(filePath) {
  return /^logs\/.+\.(jsonl|log)$/u.test(filePath);
}

function isRuntimeBeliefPath(filePath) {
  return /^beliefs\/.+\.(jsonl|json|log)$/u.test(filePath);
}

function isRuntimeDissensusPath(filePath) {
  return (
    filePath === "dissensus" ||
    filePath.startsWith("dissensus/") ||
    /^dissensus\/.+\.(jsonl|json|log)$/u.test(filePath)
  );
}

function isRuntimeSurfaceDir(filePath) {
  return (
    filePath === "beliefs" ||
    filePath === "dissensus" ||
    filePath === "memory" ||
    filePath === "logs" ||
    filePath === "review" ||
    filePath === "data" ||
    filePath === "reports" ||
    filePath === "docs/introspection"
  );
}

function isRuntimeIntrospectionPath(filePath) {
  return (
    filePath === "docs/introspection" ||
    filePath.startsWith("docs/introspection/")
  );
}

function isRuntimeReportPath(filePath) {
  return /^reports\/.+\.ndjson$/u.test(filePath);
}

function isCanonicalReportDoc(filePath) {
  return /^reports\/.+\.(md|txt)$/u.test(filePath);
}

function isCanonicalRuntimeSnapshotPath(filePath) {
  return filePath.startsWith("runtime-snapshots/");
}

function isAgentPlaneLocalStatePath(filePath) {
  return filePath === ".agentplane" || filePath.startsWith(".agentplane/");
}

module.exports = {
  isAgentPlaneLocalStatePath,
  isCanonicalReportDoc,
  isCanonicalRuntimeSnapshotPath,
  isDailyMemoryPath,
  isProjectDataPath,
  isProjectLogPath,
  isProjectStatusPath,
  isRootMarkdown,
  isRuntimeBeliefPath,
  isRuntimeDissensusPath,
  isRuntimeIntrospectionPath,
  isRuntimeLogPath,
  isRuntimeReportPath,
  isRuntimeSurfaceDir,
};
