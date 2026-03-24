const fs = require("fs");
const path = require("path");
const { WORKSPACE_ROOT } = require("../workspace/workspace-path");

function resolveOpenClawFlushMarkerPath(options = {}) {
  const workspaceRoot = options.workspaceRoot || WORKSPACE_ROOT;
  return path.join(workspaceRoot, ".openclaw-flush");
}

function persistOpenClawFlushState(options = {}) {
  const workspaceRoot = options.workspaceRoot || WORKSPACE_ROOT;
  const flushData = options.flushData || {};
  const flushPath = resolveOpenClawFlushMarkerPath({ workspaceRoot });

  fs.writeFileSync(flushPath, JSON.stringify(flushData, null, 2));

  return {
    flushPath,
    flushData,
  };
}

module.exports = {
  persistOpenClawFlushState,
  resolveOpenClawFlushMarkerPath,
};
