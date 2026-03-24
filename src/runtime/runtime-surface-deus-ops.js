"use strict";

const {
  resolveRuntimeSurfaceDir,
  resolveRuntimeSurfacePath,
  resolveRuntimeSurfaceWritePath,
} = require("./runtime-surface-base");

function resolveStatusPath(options = {}) {
  return resolveRuntimeSurfacePath("STATUS.md", options);
}

function resolveDataDir(options = {}) {
  return resolveRuntimeSurfaceDir("data", options);
}

function resolveExtractionMarkerPath(options = {}) {
  return resolveRuntimeSurfacePath("data/.last-extraction", options);
}

function resolveExtractionMarkerWritePath(options = {}) {
  return resolveRuntimeSurfaceWritePath("data/.last-extraction", options);
}

function resolveReportsDir(options = {}) {
  return resolveRuntimeSurfaceDir("reports", options);
}

function resolveOpsRollupPath(options = {}) {
  return resolveRuntimeSurfacePath("reports/ops-rollup.ndjson", options);
}

function resolveOpsRollupWritePath(options = {}) {
  return resolveRuntimeSurfaceWritePath("reports/ops-rollup.ndjson", options);
}

module.exports = {
  resolveDataDir,
  resolveExtractionMarkerPath,
  resolveExtractionMarkerWritePath,
  resolveOpsRollupPath,
  resolveOpsRollupWritePath,
  resolveReportsDir,
  resolveStatusPath,
};
