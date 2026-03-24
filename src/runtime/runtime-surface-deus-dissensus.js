"use strict";

const {
  resolveRuntimeSurfaceDir,
  resolveRuntimeSurfacePath,
  resolveRuntimeSurfaceWriteDir,
  resolveRuntimeSurfaceWritePath,
} = require("./runtime-surface-base");

function resolveDissensusDir(options = {}) {
  return resolveRuntimeSurfaceDir("dissensus", options);
}

function resolveDissensusWriteDir(options = {}) {
  return resolveRuntimeSurfaceWriteDir("dissensus", options);
}

function resolveDissensusEventsDir(options = {}) {
  return resolveRuntimeSurfaceDir("dissensus/events", options);
}

function resolveDissensusEventsWriteDir(options = {}) {
  return resolveRuntimeSurfaceWriteDir("dissensus/events", options);
}

function resolveDissensusLogPath(dayKey, options = {}) {
  return resolveRuntimeSurfacePath(`dissensus/events/${dayKey}.jsonl`, options);
}

function resolveDissensusLogWritePath(dayKey, options = {}) {
  return resolveRuntimeSurfaceWritePath(
    `dissensus/events/${dayKey}.jsonl`,
    options,
  );
}

function resolveDissensusOpenCasesPath(options = {}) {
  return resolveRuntimeSurfacePath("dissensus/open-cases.json", options);
}

function resolveDissensusOpenCasesWritePath(options = {}) {
  return resolveRuntimeSurfaceWritePath("dissensus/open-cases.json", options);
}

function resolveDissensusOverridesPath(options = {}) {
  return resolveRuntimeSurfacePath("dissensus/overrides.jsonl", options);
}

function resolveDissensusOverridesWritePath(options = {}) {
  return resolveRuntimeSurfaceWritePath("dissensus/overrides.jsonl", options);
}

module.exports = {
  resolveDissensusDir,
  resolveDissensusEventsDir,
  resolveDissensusEventsWriteDir,
  resolveDissensusLogPath,
  resolveDissensusLogWritePath,
  resolveDissensusOpenCasesPath,
  resolveDissensusOpenCasesWritePath,
  resolveDissensusOverridesPath,
  resolveDissensusOverridesWritePath,
  resolveDissensusWriteDir,
};
