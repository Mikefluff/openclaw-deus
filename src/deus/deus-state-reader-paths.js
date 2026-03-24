"use strict";

const { WORKSPACE_ROOT } = require("../workspace/workspace-path");

function resolveWorkspaceRoot(options = {}) {
  return options.workspaceRoot || WORKSPACE_ROOT;
}

module.exports = {
  resolveWorkspaceRoot,
};
