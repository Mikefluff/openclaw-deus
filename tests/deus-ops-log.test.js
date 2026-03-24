const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const {
  appendDeusOpsLog,
  readDeusOpsLogEntries,
  resolveDeusOpsLogDir,
  resolveDeusOpsLogPath,
} = require("../src/deus/deus-ops-log");
const {
  appendOpenClawIntegrationLog,
  readRecentWorkspaceLogs,
} = require("../src/openclaw/openclaw-integration-diagnostics");

function createWorkspace() {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "deus-ops-log-"));
  fs.writeFileSync(path.join(workspaceRoot, "AGENTS.md"), "# AGENTS\n");
  return workspaceRoot;
}

test("shared DEUS ops logger writes standardized JSONL events", (t) => {
  const workspaceRoot = createWorkspace();
  t.after(() => fs.rmSync(workspaceRoot, { recursive: true, force: true }));

  const { logPath } = appendDeusOpsLog({
    component: "belief-decay",
    event: "process_started",
    message: "Starting belief decay process",
    details: { run: "fixture" },
    workspaceRoot,
    echo: false,
  });

  assert.equal(
    logPath,
    resolveDeusOpsLogPath("belief-decay", { workspaceRoot }),
  );
  assert.equal(
    resolveDeusOpsLogDir({ workspaceRoot }),
    path.join(workspaceRoot, ".tmp", "diagnostics", "deus", "ops"),
  );
  const entries = readDeusOpsLogEntries("belief-decay", { workspaceRoot });
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0], {
    ts: entries[0].ts,
    component: "belief-decay",
    event: "process_started",
    message: "Starting belief decay process",
    details: { run: "fixture" },
  });
});

test("openclaw diagnostics use the shared JSONL format and daily log reader ignores component logs", () => {
  const workspaceRoot = createWorkspace();

  appendOpenClawIntegrationLog("Adapter check complete", {
    workspaceRoot,
    event: "adapter_check_completed",
    details: { memorySearchAvailable: false },
  });
  fs.mkdirSync(path.join(workspaceRoot, "logs"), { recursive: true });
  fs.writeFileSync(
    path.join(workspaceRoot, "logs", "2026-03-18.jsonl"),
    `${JSON.stringify({ type: "system", message: "daily event" })}\n`,
  );

  const entries = readDeusOpsLogEntries("openclaw-integration", {
    workspaceRoot,
  });
  assert.equal(entries[0].event, "adapter_check_completed");
  assert.deepEqual(entries[0].details, { memorySearchAvailable: false });

  const recent = readRecentWorkspaceLogs({ workspaceRoot, count: 1 });
  assert.deepEqual(recent, [{ type: "system", message: "daily event" }]);

  fs.rmSync(workspaceRoot, { recursive: true, force: true });
});
