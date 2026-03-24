"use strict";

const fs = require("fs");
const {
  resolveBeliefsPath,
  resolveBeliefsWritePath,
} = require("../runtime/runtime-surface-paths");

function loadBeliefs(options = {}) {
  const beliefsFile =
    options.beliefsFile ||
    resolveBeliefsPath({ workspaceRoot: options.workspaceRoot });

  try {
    return fs
      .readFileSync(beliefsFile, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map(JSON.parse);
  } catch {
    return [];
  }
}

function saveBeliefs(beliefs, options = {}) {
  const beliefsFile =
    options.beliefsFile ||
    resolveBeliefsWritePath({ workspaceRoot: options.workspaceRoot });
  fs.writeFileSync(
    beliefsFile,
    `${beliefs.map((belief) => JSON.stringify(belief)).join("\n")}\n`,
  );
}

module.exports = {
  loadBeliefs,
  saveBeliefs,
};
