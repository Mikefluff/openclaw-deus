/**
 * DEUS/OpenClaw Integration Tests
 * Validates the public clean-install bootstrap and runtime contract.
 */

const fs = require("fs");
const path = require("path");
const {
  createDeusWorkspaceFixtureSync,
} = require("./helpers/deus-workspace-fixture");

const WORKSPACE =
  process.env.TEST_WORKSPACE_ROOT || createDeusWorkspaceFixtureSync();

// ANSI colors
const green = "\x1b[32m";
const red = "\x1b[31m";
const yellow = "\x1b[33m";
const reset = "\x1b[0m";

let passCount = 0;
let failCount = 0;
let warnCount = 0;

function test(name, fn) {
  try {
    const result = fn();
    if (result === true) {
      console.log(`${green}✓${reset} ${name}`);
      passCount += 1;
    } else if (result === "warn") {
      console.log(`${yellow}⚠${reset} ${name}`);
      warnCount += 1;
    } else {
      console.log(`${red}✗${reset} ${name}`);
      failCount += 1;
    }
  } catch (error) {
    console.log(`${red}✗${reset} ${name}: ${error.message}`);
    failCount += 1;
  }
}

console.log("\n=== DEUS/OpenClaw Integration Tests ===\n");

// === TEST 1: Bootstrap Load Order ===
console.log("1. Bootstrap Sequence Validation\n");

test("AGENTS.md exists in root as entrypoint", () => {
  return fs.existsSync(path.join(WORKSPACE, "AGENTS.md"));
});

test("canonical bootstrap files stay in order in AGENTS.md", () => {
  const agentsMd = fs.readFileSync(path.join(WORKSPACE, "AGENTS.md"), "utf8");
  const sectionStart = agentsMd.indexOf("## Bootstrap Sequence");
  if (sectionStart === -1) {
    throw new Error("Bootstrap Sequence section not found");
  }

  const sectionEnd = agentsMd.indexOf("\n## ", sectionStart + 1);
  const section =
    sectionEnd === -1
      ? agentsMd.slice(sectionStart)
      : agentsMd.slice(sectionStart, sectionEnd);

  const sequence = [
    "SOUL.md",
    "IDENTITY.md",
    "USER.md",
    "DEUS.md",
    "beliefs/core.jsonl",
    "memory/YYYY-MM-DD.md",
  ];

  let lastIndex = -1;
  for (const file of sequence) {
    const index = section.indexOf(file);
    if (index === -1) {
      throw new Error(`${file} not found in bootstrap section`);
    }
    if (index <= lastIndex) {
      throw new Error(`${file} out of order in bootstrap`);
    }
    lastIndex = index;
  }

  return true;
});

test("Native memory_search can be called from DEUS", () => {
  const agentsMd = fs.readFileSync(path.join(WORKSPACE, "AGENTS.md"), "utf8");

  if (agentsMd.includes("memory_search")) {
    return true;
  }
  return "warn";
});

// === TEST 2: Memory Structure Format ===
console.log("\n2. Memory Format Compatibility\n");

test("Memory directory exists", () => {
  return fs.existsSync(path.join(WORKSPACE, "memory"));
});

test("Recent memory file uses Markdown format", () => {
  const memoryDir = path.join(WORKSPACE, "memory");
  const files = fs
    .readdirSync(memoryDir)
    .filter((file) => file.endsWith(".md"));
  if (files.length === 0) {
    return "warn";
  }

  const recentFile = files.sort().reverse()[0];
  const content = fs.readFileSync(path.join(memoryDir, recentFile), "utf8");
  return content.includes("# ") && content.includes("## ");
});

test("DEUS structured memory has searchable sections", () => {
  const memoryDir = path.join(WORKSPACE, "memory");
  const files = fs
    .readdirSync(memoryDir)
    .filter((file) => file.endsWith(".md"));

  for (const file of files) {
    const content = fs.readFileSync(path.join(memoryDir, file), "utf8");
    if (
      content.includes("## Git Activity") ||
      content.includes("## Commands") ||
      content.includes("## Decisions")
    ) {
      return true;
    }
  }

  return "warn";
});

test("Memory files are human-readable (not minified)", () => {
  const memoryDir = path.join(WORKSPACE, "memory");
  const files = fs
    .readdirSync(memoryDir)
    .filter((file) => file.endsWith(".md"));
  if (files.length === 0) {
    return "warn";
  }

  const recentFile = files.sort().reverse()[0];
  const content = fs.readFileSync(path.join(memoryDir, recentFile), "utf8");
  return content.includes("\n") && content.length > 100;
});

// === TEST 3: Auto-Flush Integration ===
console.log("\n3. Durability & Flush Integration\n");

test("Git repository initialized", () => {
  return fs.existsSync(path.join(WORKSPACE, ".git"));
});

test("Uncommitted changes detection works", () => {
  try {
    const { execSync } = require("child_process");
    execSync("git status --porcelain", { cwd: WORKSPACE });
    return true;
  } catch {
    return false;
  }
});

test("DEUS has proactive backup mechanism", () => {
  const scriptsDir = path.join(WORKSPACE, "scripts");
  if (!fs.existsSync(scriptsDir)) {
    return false;
  }

  const files = fs.readdirSync(scriptsDir);
  return files.some(
    (file) =>
      file.includes("backup") ||
      file.includes("introspection") ||
      file.includes("openclaw"),
  );
});

test("HEARTBEAT.md exists for OpenClaw integration", () => {
  return fs.existsSync(path.join(WORKSPACE, "HEARTBEAT.md"));
});

test("Logs directory for recovery (OpenClaw-compatible)", () => {
  const logsDir = path.join(WORKSPACE, "logs");
  if (!fs.existsSync(logsDir)) {
    return "warn";
  }

  const files = fs
    .readdirSync(logsDir)
    .filter((file) => file.endsWith(".jsonl"));
  return files.length > 0 ? true : "warn";
});

// === TEST 4: Belief System Integration ===
console.log("\n4. Belief System Layer\n");

test("beliefs/core.jsonl exists", () => {
  return fs.existsSync(path.join(WORKSPACE, "beliefs", "core.jsonl"));
});

test("Beliefs are valid JSON", () => {
  try {
    const data = fs.readFileSync(
      path.join(WORKSPACE, "beliefs", "core.jsonl"),
      "utf8",
    );
    const lines = data.trim().split("\n").filter(Boolean);
    lines.forEach((line) => JSON.parse(line));
    return true;
  } catch {
    return false;
  }
});

test("Invariants have confidence 1.0", () => {
  const data = fs.readFileSync(
    path.join(WORKSPACE, "beliefs", "core.jsonl"),
    "utf8",
  );
  const lines = data.trim().split("\n").filter(Boolean);
  const beliefs = lines.map((line) => JSON.parse(line));

  const invariants = beliefs.filter((belief) =>
    belief.belief_id.startsWith("I"),
  );
  if (invariants.length === 0) {
    return "warn";
  }

  return invariants.every((belief) => belief.confidence === 1.0);
});

// === TEST 5: OpenClaw Native Tools Available ===
console.log("\n5. OpenClaw Tool Availability\n");

test("memory_search documented or referenced", () => {
  const agents = fs.readFileSync(path.join(WORKSPACE, "AGENTS.md"), "utf8");
  const implementationPath = path.join(
    WORKSPACE,
    "docs",
    "DEUS_IMPLEMENTATION.md",
  );
  const implementation = fs.existsSync(implementationPath)
    ? fs.readFileSync(implementationPath, "utf8")
    : "";
  const integration = fs.readFileSync(
    path.join(WORKSPACE, "scripts", "openclaw-integration.js"),
    "utf8",
  );
  return (
    agents.includes("memory_search") ||
    implementation.includes("memory_search") ||
    integration.includes("memory_search")
  );
});

test("AGENTS.md mentions bootstrap sequence", () => {
  const agents = fs.readFileSync(path.join(WORKSPACE, "AGENTS.md"), "utf8");
  return (
    agents.includes("Bootstrap Sequence") && agents.includes("Do not skip")
  );
});

console.log("\n=== Test Summary ===\n");
console.log(`${green}Passed:${reset} ${passCount}`);
console.log(`${yellow}Warnings:${reset} ${warnCount}`);
console.log(`${red}Failed:${reset} ${failCount}`);
console.log(`\nTotal: ${passCount + warnCount + failCount}`);

if (failCount === 0) {
  console.log(`\n${green}✓ DEUS/OpenClaw integration is healthy${reset}`);
  process.exit(0);
} else {
  console.log(`\n${red}✗ Some integration tests failed${reset}`);
  process.exit(1);
}
