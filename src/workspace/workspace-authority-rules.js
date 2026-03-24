"use strict";

const {
  AUTHORITIES,
  LAYERS,
  SYNC_RULES,
} = require("./workspace-authority-constants");
const {
  isAgentPlaneLocalStatePath,
  isCanonicalReportDoc,
  isCanonicalRuntimeSnapshotPath,
  isDailyMemoryPath,
  isProjectDataPath,
  isProjectLogPath,
  isProjectStatusPath,
  isRootMarkdown,
  isRuntimeBeliefPath,
  isRuntimeDissensusPath,
  isRuntimeIntrospectionPath,
  isRuntimeLogPath,
  isRuntimeReportPath,
  isRuntimeSurfaceDir,
} = require("./workspace-authority-predicates");

const RULE_DEFINITIONS = Object.freeze([
  {
    id: "ephemeral_runtime_paths",
    layer: LAYERS.EPHEMERAL_RUNTIME,
    authority: AUTHORITIES.LOCAL_ONLY,
    syncRule: SYNC_RULES.NEVER_PROMOTE,
    description:
      "Disposable runtime staging, caches, and low-level diagnostics. Never treat these paths as source-of-truth.",
    examples: [
      ".tmp/diagnostics/openclaw-integration-test.json",
      ".openclaw/session.json",
      ".openclaw-flush",
    ],
    match(filePath) {
      return (
        filePath === "AGENTPLANE.md" ||
        filePath === ".openclaw-flush" ||
        filePath.startsWith(".tmp/") ||
        filePath.startsWith(".openclaw/") ||
        isAgentPlaneLocalStatePath(filePath) ||
        filePath === "logs/bootstrap-validation.json" ||
        filePath === "logs/openclaw-integration-test.json" ||
        filePath.endsWith(".bak") ||
        filePath.endsWith(".backup") ||
        filePath.endsWith(".orig") ||
        filePath.endsWith(".tmp") ||
        filePath === ".DS_Store" ||
        filePath.includes("/.DS_Store") ||
        filePath.startsWith("__MACOSX/")
      );
    },
  },
  {
    id: "live_runtime_state",
    layer: LAYERS.LIVE_RUNTIME,
    authority: AUTHORITIES.LIVE_WORKSPACE,
    syncRule: SYNC_RULES.PRESERVE_THEN_PROMOTE,
    description:
      "Tracked live state. The freshest copy belongs to the active workspace first and should be promoted to GitHub intentionally.",
    examples: [
      "STATUS.md",
      "beliefs/core.jsonl",
      "dissensus/open-cases.json",
      "memory/<YYYY-MM-DD>.md",
      "docs/introspection/introspection-followup.latest.json",
      "projects/example-project/STATUS.md",
      "projects/example-project/data/state.json",
      "projects/example-project/logs/published.json",
    ],
    match(filePath) {
      return (
        filePath === "STATUS.md" ||
        isProjectStatusPath(filePath) ||
        isRuntimeSurfaceDir(filePath) ||
        filePath.startsWith("review/") ||
        filePath.startsWith("data/") ||
        isProjectDataPath(filePath) ||
        isProjectLogPath(filePath) ||
        isDailyMemoryPath(filePath) ||
        isRuntimeLogPath(filePath) ||
        isRuntimeBeliefPath(filePath) ||
        isRuntimeDissensusPath(filePath) ||
        isRuntimeIntrospectionPath(filePath) ||
        isRuntimeReportPath(filePath)
      );
    },
  },
  {
    id: "canonical_runtime_snapshots",
    layer: LAYERS.CANONICAL_TRUNK,
    authority: AUTHORITIES.GITHUB_TRUNK,
    syncRule: SYNC_RULES.PULL_PUSH_VIA_GIT,
    description:
      "Promoted runtime snapshots captured intentionally in the canonical trunk for review, export, and audit.",
    examples: [
      "runtime-snapshots/<snapshot-id>/runtime-state.snapshot.json",
      "runtime-snapshots/latest.json",
    ],
    match(filePath) {
      return isCanonicalRuntimeSnapshotPath(filePath);
    },
  },
  {
    id: "canonical_repo_surfaces",
    layer: LAYERS.CANONICAL_TRUNK,
    authority: AUTHORITIES.GITHUB_TRUNK,
    syncRule: SYNC_RULES.PULL_PUSH_VIA_GIT,
    description:
      "Code, policy, docs, and repo structure. Edit locally, verify, push to GitHub, then pull to live workspaces.",
    examples: [
      "AGENTS.md",
      "src/deus/deus-health.js",
      "docs/DEUS_IMPLEMENTATION.md",
    ],
    match(filePath) {
      return (
        filePath === "package.json" ||
        filePath === "package-lock.json" ||
        filePath === ".nvmrc" ||
        filePath === "README.md" ||
        filePath.startsWith("src/") ||
        filePath.startsWith("scripts/") ||
        filePath.startsWith("tests/") ||
        filePath.startsWith("docs/") ||
        filePath.startsWith("infrastructure/") ||
        filePath.startsWith("skills/") ||
        filePath.startsWith("projects/") ||
        isCanonicalReportDoc(filePath) ||
        isRootMarkdown(filePath)
      );
    },
  },
]);

function getWorkspaceAuthorityManifest() {
  return RULE_DEFINITIONS.map((rule) => ({
    id: rule.id,
    layer: rule.layer,
    authority: rule.authority,
    syncRule: rule.syncRule,
    description: rule.description,
    examples: [...rule.examples],
  }));
}

module.exports = {
  RULE_DEFINITIONS,
  getWorkspaceAuthorityManifest,
};
