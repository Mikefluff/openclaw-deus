const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { DEUSMemoryFileStore } = require("../src/memory/deus-memory-file-store");

function createDateContext() {
  return {
    today: "2026-03-18",
    localTimestamp: "2026-03-18 10:00:00 +07",
  };
}

test("repair migrates legacy sectioned daily memory into canonical sections without dropping content", async () => {
  const workspace = await fs.mkdtemp(
    path.join(os.tmpdir(), "daily-memory-legacy-sections-"),
  );
  const store = new DEUSMemoryFileStore({
    workspaceRoot: workspace,
    dateContextProvider: createDateContext,
  });
  const memoryPath = path.join(workspace, "memory", "2026-03-18.md");

  await fs.mkdir(path.dirname(memoryPath), { recursive: true });
  await fs.writeFile(
    memoryPath,
    `# Memory — 2026-03-18

## Events

- deploy completed

## Decisions

- keep canonical schema

## Durable observations

- infrastructure work keeps recurring

## Open tensions

- sync drift still needs review

## Agent Memory Reflection

- recurring pattern is visible tonight
`,
  );

  const checkOnly = await store.validateFormat({
    createIfMissing: false,
    repairInvalid: false,
  });
  const repaired = await store.validateFormat();
  const content = await fs.readFile(memoryPath, "utf8");

  assert.equal(checkOnly.valid, false);
  assert.equal(repaired.valid, true);
  assert.match(content, /# 2026-03-18 — DEUS Activity Log/);
  assert.match(content, /## Decisions\n\n- keep canonical schema/);
  assert.match(content, /## System Events[\s\S]*- deploy completed/);
  assert.match(
    content,
    /Legacy durable observation: infrastructure work keeps recurring/,
  );
  assert.match(content, /Legacy open tension: sync drift still needs review/);
  assert.match(
    content,
    /Legacy memory reflection: recurring pattern is visible tonight/,
  );
  assert.doesNotMatch(content, /## Events/);
  assert.doesNotMatch(content, /## Durable observations/);
  assert.doesNotMatch(content, /## Open tensions/);
  assert.doesNotMatch(content, /## Agent Memory Reflection/);
});

test("repair migrates free-form daily memory body into canonical system events bullets", async () => {
  const workspace = await fs.mkdtemp(
    path.join(os.tmpdir(), "daily-memory-legacy-freeform-"),
  );
  const store = new DEUSMemoryFileStore({
    workspaceRoot: workspace,
    dateContextProvider: createDateContext,
  });
  const memoryPath = path.join(workspace, "memory", "2026-03-18.md");

  await fs.mkdir(path.dirname(memoryPath), { recursive: true });
  await fs.writeFile(
    memoryPath,
    `# 2026-03-18

Quiet operational day.

Need to revisit deploy checklist.
`,
  );

  await store.initToday();
  const content = await fs.readFile(memoryPath, "utf8");

  assert.match(content, /# 2026-03-18 — DEUS Activity Log/);
  assert.match(content, /## System Events[\s\S]*- Quiet operational day\./);
  assert.match(
    content,
    /## System Events[\s\S]*- Need to revisit deploy checklist\./,
  );
  assert.match(content, /\*\*Total activities:\*\* 2/);
});
