"use strict";

function normalizeWorkspacePath(filePath) {
  return String(filePath || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/");
}

module.exports = {
  normalizeWorkspacePath,
};
