const { getPolicyRuntimeSurface } = require("../policy/deus-policy-surface");
const { detectWorkspaceRoot } = require("../workspace/workspace-path");
const { getWorkspaceDateContext } = require("../workspace/workspace-date-context");

function getDeusFocusState(options = {}) {
  const workspaceRoot = options.workspaceRoot || detectWorkspaceRoot();
  const surface = getPolicyRuntimeSurface({
    workspaceRoot,
    now: options.now,
  });

  return {
    workspaceRoot,
    date: getWorkspaceDateContext(options.now),
    focusState: surface.focusState,
    sleepPlanner: surface.sleepPlanner,
    executionBoundary: {
      actionExecution: "openclaw_only",
      focusStateSource: "STATUS.md",
      boundedSleepSurface: "logs,memory,review,introspection,diagnostics",
    },
  };
}

function main(options = {}) {
  const summary = getDeusFocusState(options);
  console.log(JSON.stringify(summary, null, 2));
  return summary;
}

module.exports = {
  getDeusFocusState,
  main,
};
