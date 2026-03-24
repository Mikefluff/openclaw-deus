"use strict";

const {
  WORKSPACE_ROOT,
  canonicalPath,
  detectCanonicalRoot,
} = require("./workspace-roots");

function detectWorkspaceRoot() {
  return detectCanonicalRoot();
}

function workspacePath(...segments) {
  return canonicalPath(...segments);
}

module.exports = {
  WORKSPACE_ROOT,
  workspacePath,
  detectWorkspaceRoot,
};
