#!/usr/bin/env node

"use strict";

const {
  classifyWorkspacePath,
  getWorkspaceAuthorityManifest,
} = require("../src/workspace/workspace-authority");

function printHelp() {
  console.log(`Usage: npm run workspace:authority -- [path ...]

Print the workspace authority contract or classify one or more paths.

Examples:
  npm run workspace:authority
  npm run workspace:authority -- STATUS.md memory/<YYYY-MM-DD>.md src/deus/deus-health.js
`);
}

function renderContract() {
  const lines = ["Workspace authority contract:"];

  for (const rule of getWorkspaceAuthorityManifest()) {
    lines.push("");
    lines.push(`- ${rule.id}`);
    lines.push(`  layer: ${rule.layer}`);
    lines.push(`  authority: ${rule.authority}`);
    lines.push(`  syncRule: ${rule.syncRule}`);
    lines.push(`  description: ${rule.description}`);
    if (rule.examples.length > 0) {
      lines.push(`  examples: ${rule.examples.join(", ")}`);
    }
  }

  lines.push("");
  lines.push("Authority semantics:");
  lines.push(
    "- github_trunk: canonical repo layer; sync through git and GitHub first.",
  );
  lines.push(
    "- live_workspace: freshest live runtime state in the active workspace; preserve before pull and promote intentionally.",
  );
  lines.push(
    "- local_only: disposable runtime staging and caches; do not promote as source-of-truth.",
  );

  return `${lines.join("\n")}\n`;
}

function renderPathClassification(paths) {
  const lines = ["Workspace path classifications:"];

  for (const rawPath of paths) {
    const result = classifyWorkspacePath(rawPath);
    lines.push("");
    lines.push(`- ${result.path || rawPath}`);
    lines.push(`  layer: ${result.layer}`);
    lines.push(`  authority: ${result.authority}`);
    lines.push(`  syncRule: ${result.syncRule}`);
    lines.push(`  rule: ${result.ruleId}`);
    lines.push(`  description: ${result.description}`);
  }

  return `${lines.join("\n")}\n`;
}

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

if (args.length === 0) {
  process.stdout.write(renderContract());
  process.exit(0);
}

process.stdout.write(renderPathClassification(args));
