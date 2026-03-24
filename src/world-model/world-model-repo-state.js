"use strict";

const { execSync } = require("child_process");

function summarizeTrackedRepoState(workspaceRoot, runCommand = execSync) {
  try {
    const output = runCommand(
      "git status --porcelain -z --untracked-files=no",
      {
        cwd: workspaceRoot,
      },
    ).toString();
    const entries = output
      .split("\u0000")
      .map((entry) => entry.trim())
      .filter(Boolean);

    return {
      dirty: entries.length > 0,
      changes: entries.length,
    };
  } catch {
    return {
      dirty: false,
      changes: 0,
    };
  }
}

module.exports = {
  summarizeTrackedRepoState,
};
