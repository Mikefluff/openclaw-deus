"use strict";

const {
  resolveWorkspaceDirectoryPath,
  resolveWorkspaceFilePath,
} = require("../workspace/workspace-roots");

function resolveRuntimeSurfacePath(relativePath, options = {}) {
  return resolveWorkspaceFilePath(relativePath, options);
}

function resolveRuntimeSurfaceWritePath(relativePath, options = {}) {
  return resolveWorkspaceFilePath(relativePath, {
    ...options,
    forWrite: true,
  });
}

function resolveRuntimeSurfaceDir(relativePath, options = {}) {
  return resolveWorkspaceDirectoryPath(relativePath, options);
}

function resolveRuntimeSurfaceWriteDir(relativePath, options = {}) {
  return resolveWorkspaceDirectoryPath(relativePath, {
    ...options,
    forWrite: true,
  });
}

module.exports = {
  resolveRuntimeSurfaceDir,
  resolveRuntimeSurfacePath,
  resolveRuntimeSurfaceWriteDir,
  resolveRuntimeSurfaceWritePath,
};
