"use strict";

const {
  resolveRuntimeSurfacePath,
  resolveRuntimeSurfaceWritePath,
} = require("./runtime-surface-base");

function resolveBeliefsPath(options = {}) {
  return resolveRuntimeSurfacePath("beliefs/core.jsonl", options);
}

function resolveBeliefsWritePath(options = {}) {
  return resolveRuntimeSurfaceWritePath("beliefs/core.jsonl", options);
}

function resolveBeliefDecayOverridesPath(options = {}) {
  return resolveRuntimeSurfacePath(
    "beliefs/decay-policy.overrides.json",
    options,
  );
}

function resolveBeliefDecayOverridesWritePath(options = {}) {
  return resolveRuntimeSurfaceWritePath(
    "beliefs/decay-policy.overrides.json",
    options,
  );
}

function resolveBeliefDriftLogPath(options = {}) {
  return resolveRuntimeSurfacePath("beliefs/drift.log", options);
}

module.exports = {
  resolveBeliefDecayOverridesPath,
  resolveBeliefDecayOverridesWritePath,
  resolveBeliefDriftLogPath,
  resolveBeliefsPath,
  resolveBeliefsWritePath,
};
