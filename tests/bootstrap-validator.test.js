const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { BootstrapValidator } = require("../scripts/bootstrap-validator");
const { resolveDiagnosticPaths } = require("../src/runtime/runtime-diagnostics");
const { getWorkspaceDateContext } = require("../src/workspace/workspace-date-context");

async function createWorkspaceFixture() {
  const workspace = await fs.mkdtemp(
    path.join(os.tmpdir(), "bootstrap-validator-fixture-"),
  );
  const today = getWorkspaceDateContext().today;

  await fs.mkdir(path.join(workspace, "beliefs"), { recursive: true });
  await fs.mkdir(path.join(workspace, "memory"), { recursive: true });
  await fs.mkdir(path.join(workspace, "scripts"), { recursive: true });
  await fs.mkdir(path.join(workspace, "src"), { recursive: true });

  await fs.writeFile(path.join(workspace, "SOUL.md"), "# SOUL\n");
  await fs.writeFile(path.join(workspace, "USER.md"), "# USER\n");
  await fs.writeFile(path.join(workspace, "DEUS.md"), "# DEUS\n");
  await fs.writeFile(path.join(workspace, "IDENTITY.md"), "# IDENTITY\n");
  await fs.writeFile(path.join(workspace, "AGENTS.md"), "# AGENTS\n");
  await fs.writeFile(
    path.join(workspace, "beliefs", "core.jsonl"),
    `${JSON.stringify({
      belief_id: "I1",
      content: "Test belief",
      confidence: 1,
      source_type: "axiom",
      timestamp_created: "2026-03-01T00:00:00.000Z",
    })}\n`,
  );
  await fs.writeFile(
    path.join(workspace, "memory", "2026-03-02.md"),
    `# 2026-03-02 — DEUS Activity Log

**Total activities:** 0

## Git Activity

## Commands Executed

## Decisions

## Interactions with Human

## System Events
`,
  );
  await fs.writeFile(
    path.join(workspace, "scripts", "openclaw-integration.js"),
    "// fixture\n",
  );
  await fs.writeFile(
    path.join(workspace, "src", "deus-memory.js"),
    "// fixture\n",
  );

  return {
    today,
    workspace,
  };
}

test("bootstrap validator stays read-only by default", async () => {
  const { workspace, today } = await createWorkspaceFixture();
  const diagnosticsPaths = resolveDiagnosticPaths("bootstrap-validation", {
    workspaceRoot: workspace,
  });

  await new BootstrapValidator({ workspaceRoot: workspace }).validate();

  await assert.rejects(
    fs.access(path.join(workspace, "memory", `${today}.md`)),
    /ENOENT/,
  );
  await assert.rejects(fs.access(diagnosticsPaths.latestPath), /ENOENT/);
  await assert.rejects(
    fs.access(path.join(workspace, "logs", "bootstrap-validation.json")),
    /ENOENT/,
  );
});

test("bootstrap validator repairs and persists only when flags are enabled", async () => {
  const { workspace, today } = await createWorkspaceFixture();

  await new BootstrapValidator({
    workspaceRoot: workspace,
    repair: true,
    writeLog: true,
  }).validate();
  const diagnosticsPaths = resolveDiagnosticPaths("bootstrap-validation", {
    workspaceRoot: workspace,
  });

  const todayContent = await fs.readFile(
    path.join(workspace, "memory", `${today}.md`),
    "utf8",
  );
  const persisted = JSON.parse(
    await fs.readFile(diagnosticsPaths.latestPath, "utf8"),
  );
  const historyEntries = await fs.readdir(diagnosticsPaths.historyDir);

  assert.match(todayContent, /DEUS Activity Log/);
  assert.equal(persisted.mode, "repair");
  assert.equal(historyEntries.length, 1);
});

test("bootstrap validator reports entrypoint drift when a bootstrap file disappears mid-run", async () => {
  const { workspace } = await createWorkspaceFixture();
  const validator = new BootstrapValidator({ workspaceRoot: workspace });
  const originalValidateBeliefs = validator.validateBeliefs.bind(validator);

  validator.validateBeliefs = async () => {
    const result = await originalValidateBeliefs();
    await fs.unlink(path.join(workspace, "AGENTS.md"));
    return result;
  };

  const results = await validator.validate();
  const driftCheck = results.checks.find(
    (check) => check.check === "Entrypoint drift",
  );

  assert.equal(results.entrypointDrift.detected, true);
  assert.match(results.entrypointDrift.summary, /AGENTS\.md missing/);
  assert.equal(driftCheck.status, "✗");
});

test("bootstrap validator fails memory format in check mode when today's file exists but misses canonical sections", async () => {
  const { workspace, today } = await createWorkspaceFixture();

  await fs.writeFile(
    path.join(workspace, "memory", `${today}.md`),
    `# ${today} — DEUS Activity Log

**Total activities:** 1

## Decisions
- 2026-03-18 09:00:00 +07: keep going
`,
  );

  const results = await new BootstrapValidator({
    workspaceRoot: workspace,
  }).validate();
  const memoryFormatCheck = results.checks.find(
    (check) => check.check === "memory/YYYY-MM-DD.md format",
  );

  assert.equal(memoryFormatCheck.status, "✗");
  assert.match(
    memoryFormatCheck.details,
    /missing: Git Activity, Commands Executed, Interactions with Human, System Events/,
  );
});

test("bootstrap validator fails the memory search probe when fallback search returns no results", async () => {
  const { workspace } = await createWorkspaceFixture();
  const validator = new BootstrapValidator({
    workspaceRoot: workspace,
    memoryFactory: () => ({
      validateFormat: async () => ({
        valid: true,
        exists: true,
        created: false,
        missing: [],
      }),
      search: async () => [],
      get: async () => "fixture",
    }),
  });

  const results = await validator.validate();
  const searchCheck = results.checks.find(
    (check) => check.check === "memory_search fallback",
  );

  assert.equal(searchCheck.status, "✗");
  assert.match(searchCheck.details, /0 results/);
});
