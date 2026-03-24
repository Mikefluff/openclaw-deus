"use strict";

const path = require("path");

const { readTextFile } = require("./deus-state-reader-files");
const { resolveWorkspaceRoot } = require("./deus-state-reader-paths");

function readProjectsSnapshot(options = {}) {
  const workspaceRoot = resolveWorkspaceRoot(options);
  const projectsPath = path.join(workspaceRoot, "PROJECTS.md");
  const raw = readTextFile(projectsPath);

  return {
    exists: raw !== null,
    path: projectsPath,
    raw: raw || "",
  };
}

module.exports = {
  readProjectsSnapshot,
};
