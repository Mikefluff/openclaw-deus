#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { WORKSPACE_ROOT } = require("../src/workspace/workspace-path");

const green = "\x1b[32m";
const red = "\x1b[31m";
const yellow = "\x1b[33m";
const reset = "\x1b[0m";

let pass = 0;
let fail = 0;
let warn = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result === true) {
      console.log(`${green}✓${reset} ${name}`);
      pass++;
    } else if (result === "warn") {
      console.log(`${yellow}⚠${reset} ${name}`);
      warn++;
    } else {
      console.log(`${red}✗${reset} ${name}`);
      fail++;
    }
  } catch (e) {
    console.log(`${red}✗${reset} ${name}: ${e.message}`);
    fail++;
  }
}

const read = (p) => fs.readFileSync(path.join(WORKSPACE_ROOT, p), "utf8");
const beliefs = read("beliefs/core.jsonl")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map(JSON.parse);

console.log("\n=== DEUS Constitution Test ===\n");

test("AGENTS.md defines bootstrap sequence", () => {
  const t = read("AGENTS.md");
  return t.includes("Bootstrap Sequence") && t.includes("Do not skip");
});

test("DEUS/OpenClaw boundary doc exists", () => {
  return fs.existsSync(
    path.join(WORKSPACE_ROOT, "docs", "ARCHITECTURAL_BOUNDARY.md"),
  );
});

test("Canonical state policy exists", () => {
  return fs.existsSync(
    path.join(WORKSPACE_ROOT, "docs", "workspace", "CANONICAL_STATE.md"),
  );
});

test("Generated artifact policy exists", () => {
  return fs.existsSync(
    path.join(WORKSPACE_ROOT, "docs", "workspace", "GENERATED_ARTIFACTS.md"),
  );
});

test("Workspace authority policy distinguishes canonical trunk and live runtime", () => {
  const t = read("docs/workspace/CANONICAL_STATE.md");
  return (
    t.includes("canonical_trunk") &&
    t.includes("live_runtime") &&
    t.includes("github_trunk") &&
    t.includes("live_workspace")
  );
});

test("Axioms I1-I5 exist", () => {
  const ids = new Set(beliefs.map((b) => b.belief_id));
  return ["I1", "I2", "I3", "I4", "I5"].every((id) => ids.has(id));
});

test("Axioms I1-I5 have confidence 1.0", () => {
  const axioms = beliefs.filter((b) => /^I[1-5]$/.test(b.belief_id));
  return axioms.length === 5 && axioms.every((b) => b.confidence === 1.0);
});

test("workspace path resolver points to a repo with AGENTS.md", () => {
  return fs.existsSync(path.join(WORKSPACE_ROOT, "AGENTS.md"));
});

test("Workspace map separates live runtime from ephemeral runtime", () => {
  const t = read("docs/workspace/WORKSPACE_MAP.md");
  return (
    t.includes("Live Runtime State") &&
    t.includes("Ephemeral Runtime / Non-Canonical") &&
    t.includes(".openclaw/")
  );
});

console.log("\n=== Summary ===\n");
console.log(`${green}Passed:${reset} ${pass}`);
console.log(`${yellow}Warnings:${reset} ${warn}`);
console.log(`${red}Failed:${reset} ${fail}`);
process.exit(fail > 0 ? 1 : 0);
