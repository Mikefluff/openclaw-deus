"use strict";

const {
  resolveRuntimeSurfaceDir,
  resolveRuntimeSurfacePath,
  resolveRuntimeSurfaceWritePath,
} = require("./runtime-surface-base");

function resolveReviewDir(options = {}) {
  return resolveRuntimeSurfaceDir("review", options);
}

function resolvePendingBeliefsPath(options = {}) {
  return resolveRuntimeSurfacePath("review/pending-beliefs.md", options);
}

function resolvePendingBeliefsWritePath(options = {}) {
  return resolveRuntimeSurfaceWritePath("review/pending-beliefs.md", options);
}

function resolveOpenTensionsPath(options = {}) {
  return resolveRuntimeSurfacePath("review/open-tensions.md", options);
}

function resolveOpenTensionsWritePath(options = {}) {
  return resolveRuntimeSurfaceWritePath("review/open-tensions.md", options);
}

module.exports = {
  resolveOpenTensionsPath,
  resolveOpenTensionsWritePath,
  resolvePendingBeliefsPath,
  resolvePendingBeliefsWritePath,
  resolveReviewDir,
};
