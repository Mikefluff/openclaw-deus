"use strict";

const {
  resolveRuntimeSurfaceDir,
  resolveRuntimeSurfacePath,
  resolveRuntimeSurfaceWriteDir,
  resolveRuntimeSurfaceWritePath,
} = require("./runtime-surface-base");

function resolveMemoryDir(options = {}) {
  return resolveRuntimeSurfaceDir("memory", options);
}

function resolveMemoryWriteDir(options = {}) {
  return resolveRuntimeSurfaceWriteDir("memory", options);
}

function resolveMemoryPath(dayKey, options = {}) {
  return resolveRuntimeSurfacePath(`memory/${dayKey}.md`, options);
}

function resolveMemoryWritePath(dayKey, options = {}) {
  return resolveRuntimeSurfaceWritePath(`memory/${dayKey}.md`, options);
}

function resolveLogsDir(options = {}) {
  return resolveRuntimeSurfaceDir("logs", options);
}

function resolveLogsWriteDir(options = {}) {
  return resolveRuntimeSurfaceWriteDir("logs", options);
}

function resolveLogPath(dayKey, options = {}) {
  return resolveRuntimeSurfacePath(`logs/${dayKey}.jsonl`, options);
}

function resolveLogWritePath(dayKey, options = {}) {
  return resolveRuntimeSurfaceWritePath(`logs/${dayKey}.jsonl`, options);
}

module.exports = {
  resolveLogPath,
  resolveLogWritePath,
  resolveLogsDir,
  resolveLogsWriteDir,
  resolveMemoryDir,
  resolveMemoryPath,
  resolveMemoryWriteDir,
  resolveMemoryWritePath,
};
