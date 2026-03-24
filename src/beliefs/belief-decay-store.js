"use strict";

const fs = require("fs");

const { resolveBeliefsPath, resolveBeliefsWritePath } = require("../runtime/runtime-surface-paths");

function loadBeliefs(options = {}) {
  try {
    const data = fs.readFileSync(resolveBeliefsPath(options), "utf8");
    return data
      .trim()
      .split("\n")
      .filter((line) => line)
      .map((line) => JSON.parse(line));
  } catch (error) {
    console.error("Failed to load beliefs:", error.message);
    return [];
  }
}

function saveBeliefs(beliefs, options = {}) {
  const data = beliefs.map((belief) => JSON.stringify(belief)).join("\n") + "\n";
  fs.writeFileSync(resolveBeliefsWritePath(options), data);
}

module.exports = {
  loadBeliefs,
  saveBeliefs,
};
