const test = require("node:test");
const assert = require("node:assert/strict");

const { DEUSMemory } = require("../src/memory/deus-memory");

test("DEUSMemory delegates native reads and file-backed writes to separate collaborators", async () => {
  const calls = [];
  const fileStore = {
    workspace: "/tmp/workspace",
    memoryDir: "/tmp/workspace/memory",
    today: "2026-03-18",
    memoryPath: "/tmp/workspace/memory/2026-03-18.md",
    getDateContext() {
      return {
        today: this.today,
        localTimestamp: "2026-03-18 12:00:00 +07",
      };
    },
    getMemoryPathForDay(dayKey) {
      return `/tmp/workspace/memory/${dayKey}.md`;
    },
    getActiveMemoryTarget() {
      return {
        today: this.today,
        memoryPath: this.memoryPath,
        dateContext: this.getDateContext(),
      };
    },
    fallbackSearch: async (query, maxResults) => {
      calls.push(["fallbackSearch", query, maxResults]);
      return [{ path: "memory/example.md", score: 1 }];
    },
    fallbackGet: async (filePath, from, lines) => {
      calls.push(["fallbackGet", filePath, from, lines]);
      return "fallback-content";
    },
    ensureDailyMemoryDocument: async () => ({ created: false, content: "" }),
    initToday: async () => false,
    addEntry: async () => true,
    logGit: async () => true,
    logCommand: async () => true,
    logDecision: async () => true,
    logInteraction: async () => true,
    logEvent: async () => true,
    validateFormat: async () => ({ valid: true, missing: [] }),
  };
  const nativeClient = {
    search: async (query, options, fallback) => {
      calls.push(["nativeSearch", query, options.maxResults]);
      return fallback(query, options.maxResults);
    },
    get: async (filePath, options, fallback) => {
      calls.push(["nativeGet", filePath, options.from, options.lines]);
      return fallback(filePath, options.from, options.lines);
    },
  };
  const memory = new DEUSMemory({ fileStore, nativeClient });

  const searchResults = await memory.search("Git", { maxResults: 2 });
  const getResult = await memory.get("memory/example.md", {
    from: 3,
    lines: 5,
  });

  assert.equal(memory.today, "2026-03-18");
  assert.equal(memory.memoryPath, "/tmp/workspace/memory/2026-03-18.md");
  assert.deepEqual(searchResults, [{ path: "memory/example.md", score: 1 }]);
  assert.equal(getResult, "fallback-content");
  assert.deepEqual(calls, [
    ["nativeSearch", "Git", 2],
    ["fallbackSearch", "Git", 2],
    ["nativeGet", "memory/example.md", 3, 5],
    ["fallbackGet", "memory/example.md", 3, 5],
  ]);
});
