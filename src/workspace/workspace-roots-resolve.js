"use strict";

const fs = require("fs");
const path = require("path");

const { classifyWorkspacePath, LAYERS } = require("./workspace-authority");
const { detectCanonicalRoot } = require("./workspace-roots-detect");
const {
  defaultRuntimeRoot,
  defaultSnapshotRoot,
} = require("./workspace-roots-layout");

function resolveCandidatePath(basePath, candidate) {
  if (!candidate) {
    return null;
  }

  return path.isAbsolute(candidate)
    ? path.resolve(candidate)
    : path.resolve(basePath, candidate);
}

function resolveWorkspaceRoots(options = {}) {
  const canonicalRoot = path.resolve(
    options.workspaceRoot ||
      options.canonicalRoot ||
      process.env.DEUS_CANONICAL_ROOT ||
      detectCanonicalRoot(),
  );
  const runtimeCandidate = resolveCandidatePath(
    canonicalRoot,
    options.runtimeRoot ||
      process.env.DEUS_RUNTIME_ROOT ||
      process.env.OPENCLAW_RUNTIME_ROOT,
  );
  const runtimeRoot = runtimeCandidate || defaultRuntimeRoot(canonicalRoot);
  const configuredSnapshotRoot = resolveCandidatePath(
    canonicalRoot,
    options.snapshotRoot || process.env.DEUS_SNAPSHOT_ROOT,
  );
  const snapshotRoot =
    configuredSnapshotRoot || defaultSnapshotRoot(canonicalRoot);

  return {
    canonicalRoot,
    runtimeRoot: path.resolve(runtimeRoot),
    snapshotRoot: path.resolve(snapshotRoot),
    runtimeSplit: path.resolve(runtimeRoot) !== canonicalRoot,
  };
}

function resolveLayerRoot(layer, options = {}) {
  const roots = resolveWorkspaceRoots(options);

  if (layer === LAYERS.LIVE_RUNTIME) {
    return roots.runtimeRoot;
  }

  return roots.canonicalRoot;
}

function resolveWorkspaceFilePath(relativePath, options = {}) {
  const normalizedPath = String(relativePath || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .trim();
  const classification = classifyWorkspacePath(normalizedPath);
  const roots = resolveWorkspaceRoots(options);
  const preferredRoot = resolveLayerRoot(classification.layer, options);
  const preferredPath = path.join(preferredRoot, normalizedPath);

  if (options.forWrite) {
    return preferredPath;
  }

  if (
    classification.layer === LAYERS.LIVE_RUNTIME &&
    roots.runtimeSplit &&
    !fs.existsSync(preferredPath)
  ) {
    const legacyCanonicalPath = path.join(roots.canonicalRoot, normalizedPath);
    if (fs.existsSync(legacyCanonicalPath)) {
      return legacyCanonicalPath;
    }
  }

  return preferredPath;
}

function resolveWorkspaceDirectoryPath(relativePath, options = {}) {
  const normalizedPath = String(relativePath || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .trim();
  const classification = classifyWorkspacePath(normalizedPath);
  const roots = resolveWorkspaceRoots(options);
  const preferredRoot = resolveLayerRoot(classification.layer, options);
  const preferredPath = path.join(preferredRoot, normalizedPath);

  if (options.forWrite) {
    return preferredPath;
  }

  if (
    classification.layer === LAYERS.LIVE_RUNTIME &&
    roots.runtimeSplit &&
    !fs.existsSync(preferredPath)
  ) {
    const legacyCanonicalPath = path.join(roots.canonicalRoot, normalizedPath);
    if (fs.existsSync(legacyCanonicalPath)) {
      return legacyCanonicalPath;
    }
  }

  return preferredPath;
}

function resolveExistingWorkspaceFilePath(relativePath, options = {}) {
  const resolvedPath = resolveWorkspaceFilePath(relativePath, options);
  if (fs.existsSync(resolvedPath)) {
    return resolvedPath;
  }

  const roots = resolveWorkspaceRoots(options);
  const normalizedPath = String(relativePath || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .trim();
  const canonicalFallback = path.join(roots.canonicalRoot, normalizedPath);

  if (fs.existsSync(canonicalFallback)) {
    return canonicalFallback;
  }

  return resolvedPath;
}

function relativizeKnownWorkspacePath(targetPath, options = {}) {
  const roots = resolveWorkspaceRoots(options);
  const absoluteTargetPath = path.resolve(String(targetPath || ""));
  const runtimeRelative = path.relative(roots.runtimeRoot, absoluteTargetPath);

  if (
    runtimeRelative &&
    !runtimeRelative.startsWith("..") &&
    !path.isAbsolute(runtimeRelative)
  ) {
    return runtimeRelative.replace(/\\/g, "/");
  }

  const canonicalRelative = path.relative(
    roots.canonicalRoot,
    absoluteTargetPath,
  );
  if (
    canonicalRelative &&
    !canonicalRelative.startsWith("..") &&
    !path.isAbsolute(canonicalRelative)
  ) {
    return canonicalRelative.replace(/\\/g, "/");
  }

  return String(targetPath || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "");
}

module.exports = {
  resolveCandidatePath,
  resolveExistingWorkspaceFilePath,
  resolveLayerRoot,
  resolveWorkspaceDirectoryPath,
  resolveWorkspaceFilePath,
  resolveWorkspaceRoots,
  relativizeKnownWorkspacePath,
};
