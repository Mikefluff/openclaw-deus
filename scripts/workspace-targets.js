const fs = require("fs");
const path = require("path");

const workspaceRoot = path.resolve(__dirname, "..");

const workspaceTargetCandidates = [
  {
    name: "root",
    relativeDir: ".",
    setupCommandArgs: ["install"],
    verifyCommandArgs: ["test"],
    verifyScriptName: "test",
  },
];

function discoverProjectTargets() {
  const projectsRoot = path.join(workspaceRoot, "projects");
  if (!fs.existsSync(projectsRoot)) {
    return [];
  }

  return fs
    .readdirSync(projectsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      relativeDir: path.posix.join("projects", entry.name),
      setupCommandArgs: ["install"],
      verifyCommandArgs: ["test"],
      verifyScriptName: "test",
    }))
    .filter((target) =>
      fs.existsSync(
        path.join(workspaceRoot, target.relativeDir, "package.json"),
      ),
    );
}

const workspaceTargets = [
  ...workspaceTargetCandidates,
  ...discoverProjectTargets(),
];

module.exports = {
  workspaceTargetCandidates,
  workspaceTargets,
};
