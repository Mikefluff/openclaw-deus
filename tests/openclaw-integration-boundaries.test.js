const test = require("node:test");
const assert = require("node:assert/strict");

const {
  OpenClawIntegration,
  runOpenClawIntegrationCheck,
} = require("../scripts/openclaw-integration");

test("OpenClaw integration delegates diagnostics reads and flush persistence to collaborators", async () => {
  const calls = [];
  const integration = new OpenClawIntegration({
    workspaceRoot: "/tmp/openclaw-integration-boundaries",
    memorySearchDetector: () => false,
    logger: (message) => {
      calls.push(["log", message]);
    },
    beliefSnapshotReader: () => {
      calls.push(["beliefSnapshot"]);
      return 3;
    },
    recentLogsReader: (count) => {
      calls.push(["recentLogs", count]);
      return [{ message: "recent-event" }];
    },
    policySurfaceReader: () => {
      calls.push(["policySurface"]);
      return {
        worldModel: { confidence: 0.82 },
        focusState: { status: "waiting", mode: "idle" },
        sleepPlanner: { decision: "sleep_reflection", allowedNow: true },
        actionPolicy: { decision: "prepare_conditions" },
      };
    },
    flushStateWriter: (flushData) => {
      calls.push([
        "flushStateWriter",
        flushData.reason,
        flushData.beliefSnapshot,
        flushData.recentLogs.length,
        flushData.policySurface.actionPolicy.decision,
      ]);
      return {
        flushPath: "/tmp/openclaw-integration-boundaries/.openclaw-flush",
      };
    },
  });

  integration.registerFlushCallback(async (flushData) => {
    calls.push(["callback", flushData.reason, flushData.beliefSnapshot]);
  });

  const flushData = await integration.triggerFlush("manual-test");

  assert.equal(flushData.reason, "manual-test");
  assert.equal(flushData.beliefSnapshot, 3);
  assert.deepEqual(flushData.recentLogs, [{ message: "recent-event" }]);
  assert.deepEqual(flushData.policySurface.focusState, {
    status: "waiting",
    mode: "idle",
  });
  assert.deepEqual(flushData.policySurface.sleepPlanner, {
    decision: "sleep_reflection",
    allowedNow: true,
  });
  assert.equal(
    flushData.policySurface.actionPolicy.decision,
    "prepare_conditions",
  );
  assert.deepEqual(calls, [
    ["log", "Registered flush callback"],
    ["log", "Flush triggered: manual-test"],
    ["beliefSnapshot"],
    ["recentLogs", 10],
    ["policySurface"],
    ["callback", "manual-test", 3],
    ["flushStateWriter", "manual-test", 3, 1, "prepare_conditions"],
  ]);
});

test("OpenClaw integration previewFlush stays read-only while still building flush data", async () => {
  const calls = [];
  const integration = new OpenClawIntegration({
    workspaceRoot: "/tmp/openclaw-integration-preview",
    memorySearchDetector: () => false,
    logger: (message) => {
      calls.push(["log", message]);
    },
    beliefSnapshotReader: () => {
      calls.push(["beliefSnapshot"]);
      return 5;
    },
    recentLogsReader: (count) => {
      calls.push(["recentLogs", count]);
      return [{ message: "preview-event" }];
    },
    policySurfaceReader: () => {
      calls.push(["policySurface"]);
      return { actionPolicy: { decision: "blocked" } };
    },
    flushStateWriter: () => {
      calls.push(["flushStateWriter"]);
    },
  });

  integration.registerFlushCallback(async () => {
    calls.push(["callback"]);
  });

  const flushData = await integration.previewFlush("manual-test");

  assert.equal(flushData.reason, "manual-test");
  assert.equal(flushData.beliefSnapshot, 5);
  assert.deepEqual(flushData.recentLogs, [{ message: "preview-event" }]);
  assert.deepEqual(flushData.policySurface, {
    actionPolicy: { decision: "blocked" },
  });
  assert.deepEqual(calls, [
    ["log", "Registered flush callback"],
    ["log", "Flush preview requested: manual-test"],
    ["beliefSnapshot"],
    ["recentLogs", 10],
    ["policySurface"],
  ]);
});

test("OpenClaw integration script main delegates to the injected runtime and prints a stable summary", async () => {
  const output = [];
  const result = await runOpenClawIntegrationCheck({
    integration: {
      memorySearchAvailable: false,
      async searchMemory() {
        return [{ file: "2026-03-23.md", score: 0.5 }];
      },
      validateMemorySearchEffectiveness() {
        return [
          {
            query: "Git commit",
            expectedSection: "Git Activity",
            found: true,
            hasExpectedSection: true,
          },
        ];
      },
      async previewFlush() {
        return { reason: "manual-test" };
      },
    },
    log: (line) => output.push(line),
  });

  assert.equal(result.memorySearchAvailable, false);
  assert.equal(result.searchResultsCount, 1);
  assert.deepEqual(result.validation, [
    {
      query: "Git commit",
      expectedSection: "Git Activity",
      found: true,
      hasExpectedSection: true,
    },
  ]);
  assert.deepEqual(output, [
    "\n=== OpenClaw Integration Check ===\n",
    "memory_search available: false",
    "\n--- Memory Search Test ---",
    "Found 1 results",
    "  - 2026-03-23.md: score 0.50",
    "\n--- Memory Format Validation ---",
    '✓ "Git commit" → Git Activity',
    "\n--- Flush Preview Test ---",
    "Flush preview built",
  ]);
});
