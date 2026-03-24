const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { DEUSMemory } = require("../src/memory/deus-memory");

test("DEUSMemory switches daily targets lazily when the date context changes", async () => {
  const workspace = await fs.mkdtemp(
    path.join(os.tmpdir(), "deus-memory-rollover-"),
  );
  let currentContext = {
    today: "2026-03-17",
    localTimestamp: "2026-03-17 23:59:00 +07",
  };

  const memory = new DEUSMemory({
    workspaceRoot: workspace,
    dateContextProvider: () => currentContext,
  });

  await memory.initToday();

  assert.equal(memory.today, "2026-03-17");
  assert.match(memory.memoryPath, /2026-03-17\.md$/);

  currentContext = {
    today: "2026-03-18",
    localTimestamp: "2026-03-18 00:01:00 +07",
  };

  assert.equal(memory.today, "2026-03-18");
  assert.match(memory.memoryPath, /2026-03-18\.md$/);

  await memory.logEvent("Day rollover test");

  const previousDay = await fs.readFile(
    path.join(workspace, "memory", "2026-03-17.md"),
    "utf8",
  );
  const nextDay = await fs.readFile(
    path.join(workspace, "memory", "2026-03-18.md"),
    "utf8",
  );

  assert.match(previousDay, /2026-03-17/);
  assert.match(nextDay, /Day rollover test/);
});
