"use strict";

const fs = require("fs");
const path = require("path");
const { resolveWorkspaceRoots } = require("../workspace/workspace-roots");
const {
  resolveRuntimeSurfaceDir,
  resolveRuntimeSurfacePath,
} = require("./runtime-surface-base");

function resolveProjectDataDir(projectName, options = {}) {
  return resolveRuntimeSurfaceDir(`projects/${projectName}/data`, options);
}

function resolveProjectDataPath(projectName, relativePath = "", options = {}) {
  const normalized = String(relativePath || "").replace(/^\/+/, "");
  const base = `projects/${projectName}/data`;
  return resolveRuntimeSurfacePath(
    normalized ? `${base}/${normalized}` : base,
    options,
  );
}

function resolveProjectLogsDir(projectName, options = {}) {
  return resolveRuntimeSurfaceDir(`projects/${projectName}/logs`, options);
}

function resolveProjectLogPath(projectName, relativePath = "", options = {}) {
  const normalized = String(relativePath || "").replace(/^\/+/, "");
  const base = `projects/${projectName}/logs`;
  return resolveRuntimeSurfacePath(
    normalized ? `${base}/${normalized}` : base,
    options,
  );
}

function resolveProjectStatusPath(projectName, options = {}) {
  return resolveRuntimeSurfacePath(
    `projects/${projectName}/STATUS.md`,
    options,
  );
}

function listKnownProjectRuntimeSurfaces(options = {}) {
  const roots = resolveWorkspaceRoots(options);
  const candidates = [roots.runtimeRoot, roots.canonicalRoot];
  const seen = new Set();

  for (const rootPath of candidates) {
    const projectsDir = path.join(rootPath, "projects");
    if (!fs.existsSync(projectsDir)) {
      continue;
    }

    for (const entry of fs.readdirSync(projectsDir)) {
      const dataDir = path.join(projectsDir, entry, "data");
      const logsDir = path.join(projectsDir, entry, "logs");
      const statusPath = path.join(projectsDir, entry, "STATUS.md");
      if (fs.existsSync(dataDir)) {
        seen.add(`projects/${entry}/data`);
      }
      if (fs.existsSync(logsDir)) {
        seen.add(`projects/${entry}/logs`);
      }
      if (fs.existsSync(statusPath)) {
        seen.add(`projects/${entry}/STATUS.md`);
      }
    }
  }

  return [...seen].sort();
}

module.exports = {
  listKnownProjectRuntimeSurfaces,
  resolveProjectDataDir,
  resolveProjectDataPath,
  resolveProjectLogPath,
  resolveProjectLogsDir,
  resolveProjectStatusPath,
};
