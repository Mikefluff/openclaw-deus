#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { workspaceTargets } = require("./workspace-targets");
const {
  AUTHORITIES,
  LAYERS,
  classifyWorkspacePath,
} = require("../src/workspace/workspace-authority");

const workspaceRoot = path.resolve(__dirname, "..");
const checks = [];

function addCheck(name, ok, detail) {
  checks.push({ name, ok, detail });
}

function fileExists(relativePath) {
  return fs.existsSync(path.resolve(workspaceRoot, relativePath));
}

function readJson(relativePath) {
  return JSON.parse(
    fs.readFileSync(path.resolve(workspaceRoot, relativePath), "utf8"),
  );
}

function requireFile(relativePath, label) {
  const ok = fileExists(relativePath);
  addCheck(label, ok, ok ? `found ${relativePath}` : `missing ${relativePath}`);
  return ok;
}

function addAuthorityCheck(
  name,
  relativePath,
  expectedLayer,
  expectedAuthority,
) {
  const result = classifyWorkspacePath(relativePath);
  addCheck(
    name,
    result.layer === expectedLayer && result.authority === expectedAuthority,
    `${relativePath} -> ${result.layer}/${result.authority}/${result.syncRule}`,
  );
}

const rootPackageOk = requireFile("package.json", "root package.json exists");
requireFile(".nvmrc", ".nvmrc exists");
requireFile("INSTALL.md", "INSTALL.md exists");
requireFile(
  "docs/workspace/CANONICAL_STATE.md",
  "docs/workspace/CANONICAL_STATE.md exists",
);
requireFile(
  "docs/workspace/WORKSPACE_MAP.md",
  "docs/workspace/WORKSPACE_MAP.md exists",
);
requireFile(
  "docs/workspace/GENERATED_ARTIFACTS.md",
  "docs/workspace/GENERATED_ARTIFACTS.md exists",
);

const rootPackage = rootPackageOk ? readJson("package.json") : {};
const rootScripts = rootPackage.scripts || {};
const requiredRootScripts = [
  "cleanliness:workspace",
  "workspace:authority",
  "setup:workspace",
  "doctor:workspace",
  "verify:workspace",
  "deus:scenarios",
  "deus:bootstrap",
  "deus:focus",
  "deus:health",
  "deus:sleep",
  "deus:sleep:dry",
  "deus:introspect",
  "deus:introspect:dry",
  "deus:introspection:followup",
  "deus:decay:tune",
  "deus:decay:tune:dry",
  "deus:beliefs:cycle",
  "deus:nightly",
  "deus:openclaw:check",
];

for (const scriptName of requiredRootScripts) {
  addCheck(
    `root script ${scriptName} exists`,
    typeof rootScripts[scriptName] === "string",
    rootScripts[scriptName] || "missing",
  );
}

addCheck(
  "root engines.node exists",
  typeof rootPackage.engines?.node === "string",
  rootPackage.engines?.node || "missing",
);
addCheck(
  "legacy workspace tmp/ directory absent",
  !fileExists("tmp"),
  fileExists("tmp") ? "found legacy tmp/ directory" : "use .tmp/ for staging",
);

const baselineLine = fileExists(".nvmrc")
  ? fs.readFileSync(path.resolve(workspaceRoot, ".nvmrc"), "utf8").trim()
  : "";
const baselineMajor = Number.parseInt(baselineLine, 10);
const currentMajor = Number.parseInt(process.versions.node.split(".")[0], 10);

addCheck(
  "nvm baseline is parseable",
  Number.isInteger(baselineMajor),
  baselineLine || "empty",
);

if (Number.isInteger(baselineMajor)) {
  addCheck(
    "current Node major satisfies baseline",
    currentMajor >= baselineMajor,
    `current=${process.version} baseline=${baselineMajor}`,
  );
}

addAuthorityCheck(
  "workspace authority classifies src/ as canonical trunk",
  "src/deus/deus-health.js",
  LAYERS.CANONICAL_TRUNK,
  AUTHORITIES.GITHUB_TRUNK,
);
addAuthorityCheck(
  "workspace authority classifies STATUS.md as live runtime",
  "STATUS.md",
  LAYERS.LIVE_RUNTIME,
  AUTHORITIES.LIVE_WORKSPACE,
);
addAuthorityCheck(
  "workspace authority classifies memory files as live runtime",
  "memory/2026-03-22.md",
  LAYERS.LIVE_RUNTIME,
  AUTHORITIES.LIVE_WORKSPACE,
);
addAuthorityCheck(
  "workspace authority classifies introspection outputs as live runtime",
  "docs/introspection/introspection-followup.latest.json",
  LAYERS.LIVE_RUNTIME,
  AUTHORITIES.LIVE_WORKSPACE,
);
addAuthorityCheck(
  "workspace authority classifies .tmp diagnostics as ephemeral runtime",
  ".tmp/diagnostics/openclaw-integration-test.json",
  LAYERS.EPHEMERAL_RUNTIME,
  AUTHORITIES.LOCAL_ONLY,
);
addAuthorityCheck(
  "workspace authority classifies local AgentPlane gateway as ephemeral runtime",
  "AGENTPLANE.md",
  LAYERS.EPHEMERAL_RUNTIME,
  AUTHORITIES.LOCAL_ONLY,
);
addAuthorityCheck(
  "workspace authority classifies local AgentPlane workspace as ephemeral runtime",
  ".agentplane/config.json",
  LAYERS.EPHEMERAL_RUNTIME,
  AUTHORITIES.LOCAL_ONLY,
);

for (const target of workspaceTargets) {
  const packageJsonPath =
    path.posix
      .join(
        target.relativeDir === "." ? "" : target.relativeDir,
        "package.json",
      )
      .replace(/^\//, "") || "package.json";
  const packageLockPath =
    path.posix
      .join(
        target.relativeDir === "." ? "" : target.relativeDir,
        "package-lock.json",
      )
      .replace(/^\//, "") || "package-lock.json";

  const packageJsonOk = requireFile(
    packageJsonPath,
    `${target.name}: package.json exists`,
  );
  requireFile(packageLockPath, `${target.name}: package-lock.json exists`);

  if (!packageJsonOk) {
    continue;
  }

  const targetPackage = readJson(packageJsonPath);
  addCheck(
    `${target.name}: engines.node exists`,
    typeof targetPackage.engines?.node === "string",
    targetPackage.engines?.node || "missing",
  );
  addCheck(
    `${target.name}: verify script ${target.verifyScriptName} exists`,
    typeof targetPackage.scripts?.[target.verifyScriptName] === "string",
    targetPackage.scripts?.[target.verifyScriptName] || "missing",
  );
}

console.log("Workspace doctor checks:");

for (const check of checks) {
  console.log(
    `- [${check.ok ? "PASS" : "FAIL"}] ${check.name} :: ${check.detail}`,
  );
}

const failedChecks = checks.filter((check) => !check.ok);

console.log("");
console.log(
  `Summary: ${checks.length - failedChecks.length} passed, ${failedChecks.length} failed`,
);

if (failedChecks.length > 0) {
  process.exit(1);
}

console.log("Workspace doctor completed successfully.");
