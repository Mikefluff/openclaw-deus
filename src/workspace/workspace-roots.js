"use strict";

const detect = require("./workspace-roots-detect");
const layout = require("./workspace-roots-layout");
const resolve = require("./workspace-roots-resolve");

const WORKSPACE_ROOTS = resolve.resolveWorkspaceRoots();
const WORKSPACE_ROOT = WORKSPACE_ROOTS.canonicalRoot;
const RUNTIME_ROOT = WORKSPACE_ROOTS.runtimeRoot;
const SNAPSHOT_ROOT = WORKSPACE_ROOTS.snapshotRoot;

function canonicalPath(...segments) {
  const path = require("path");
  return path.join(WORKSPACE_ROOT, ...segments);
}

function runtimePath(...segments) {
  const path = require("path");
  return path.join(RUNTIME_ROOT, ...segments);
}

function snapshotPath(...segments) {
  const path = require("path");
  return path.join(SNAPSHOT_ROOT, ...segments);
}

module.exports = {
  ...detect,
  ...layout,
  ...resolve,
  RUNTIME_ROOT,
  SNAPSHOT_ROOT,
  WORKSPACE_ROOT,
  WORKSPACE_ROOTS,
  canonicalPath,
  runtimePath,
  snapshotPath,
};
