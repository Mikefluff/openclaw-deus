"use strict";

const path = require("path");

function defaultRuntimeRoot(canonicalRoot) {
  return path.resolve(canonicalRoot);
}

function defaultSnapshotRoot(canonicalRoot) {
  return path.join(canonicalRoot, "runtime-snapshots");
}

module.exports = {
  defaultRuntimeRoot,
  defaultSnapshotRoot,
};
