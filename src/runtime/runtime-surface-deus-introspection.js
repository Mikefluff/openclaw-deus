"use strict";

const {
  resolveRuntimeSurfaceDir,
  resolveRuntimeSurfacePath,
  resolveRuntimeSurfaceWriteDir,
  resolveRuntimeSurfaceWritePath,
} = require("./runtime-surface-base");

function resolveIntrospectionDir(options = {}) {
  return resolveRuntimeSurfaceDir("docs/introspection", options);
}

function resolveIntrospectionWriteDir(options = {}) {
  return resolveRuntimeSurfaceWriteDir("docs/introspection", options);
}

function resolveIntrospectionSummaryPath(options = {}) {
  return resolveRuntimeSurfacePath(
    "docs/introspection/introspection-summaries.jsonl",
    options,
  );
}

function resolveIntrospectionSummaryWritePath(options = {}) {
  return resolveRuntimeSurfaceWritePath(
    "docs/introspection/introspection-summaries.jsonl",
    options,
  );
}

function resolveIntrospectionFollowupLatestPath(options = {}) {
  return resolveRuntimeSurfacePath(
    "docs/introspection/introspection-followup.latest.json",
    options,
  );
}

function resolveWorldModelLatestPath(options = {}) {
  return resolveRuntimeSurfacePath(
    "docs/introspection/world-model.latest.json",
    options,
  );
}

module.exports = {
  resolveIntrospectionDir,
  resolveIntrospectionFollowupLatestPath,
  resolveIntrospectionSummaryPath,
  resolveIntrospectionSummaryWritePath,
  resolveIntrospectionWriteDir,
  resolveWorldModelLatestPath,
};
