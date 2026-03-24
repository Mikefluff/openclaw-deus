// DEUS Memory Manager - Native OpenClaw Integration
// Uses memory_search and memory_get tools instead of direct file reads

const { WORKSPACE_ROOT } = require("../workspace/workspace-path");
const { getWorkspaceDateContext } = require("../workspace/workspace-date-context");
const { DEUSMemoryFileStore } = require("./deus-memory-file-store");
const { OpenClawMemoryClient } = require("../openclaw/openclaw-memory-client");

class DEUSMemory {
  constructor(options = {}) {
    const {
      workspaceRoot = WORKSPACE_ROOT,
      dateContextProvider = getWorkspaceDateContext,
      fileStore,
      nativeClient,
    } = options;

    this.fileStore =
      fileStore ||
      new DEUSMemoryFileStore({
        workspaceRoot,
        dateContextProvider,
      });
    this.nativeClient = nativeClient || new OpenClawMemoryClient();
  }

  get workspace() {
    return this.fileStore.workspace;
  }

  get memoryDir() {
    return this.fileStore.memoryDir;
  }

  get today() {
    return this.fileStore.today;
  }

  get memoryPath() {
    return this.fileStore.memoryPath;
  }

  getDateContext() {
    return this.fileStore.getDateContext();
  }

  getMemoryPathForDay(dayKey) {
    return this.fileStore.getMemoryPathForDay(dayKey);
  }

  getActiveMemoryTarget() {
    return this.fileStore.getActiveMemoryTarget();
  }

  async search(query, options = {}) {
    return this.nativeClient.search(query, options, (fallbackQuery, maxResults) =>
      this.fileStore.fallbackSearch(fallbackQuery, maxResults),
    );
  }

  async get(filePath, options = {}) {
    return this.nativeClient.get(
      filePath,
      options,
      (resolvedPath, from, lines) =>
        this.fileStore.fallbackGet(resolvedPath, from, lines),
    );
  }

  async fallbackSearch(query, maxResults) {
    return this.fileStore.fallbackSearch(query, maxResults);
  }

  async fallbackGet(filePath, from, lines) {
    return this.fileStore.fallbackGet(filePath, from, lines);
  }

  async ensureDailyMemoryDocument(target) {
    return this.fileStore.ensureDailyMemoryDocument(target);
  }

  async initToday(target) {
    return this.fileStore.initToday(target);
  }

  async addEntry(section, entry) {
    return this.fileStore.addEntry(section, entry);
  }

  async logGit(activity) {
    return this.fileStore.logGit(activity);
  }

  async logCommand(command) {
    return this.fileStore.logCommand(command);
  }

  async logDecision(decision, reasoning) {
    return this.fileStore.logDecision(decision, reasoning);
  }

  async logInteraction(description) {
    return this.fileStore.logInteraction(description);
  }

  async logEvent(event) {
    return this.fileStore.logEvent(event);
  }

  async validateFormat(options = {}) {
    return this.fileStore.validateFormat(options);
  }
}

module.exports = { DEUSMemory };

if (require.main === module) {
  const mem = new DEUSMemory();

  mem
    .search("Git commit", { maxResults: 3 })
    .then((results) => {
      console.log(`\nSearch results: ${results.length}`);
      results.forEach((result) =>
        console.log(`  - ${result.path}: ${result.score.toFixed(2)}`),
      );

      return mem.validateFormat();
    })
    .then((validation) => {
      console.log(`\nFormat validation: ${validation.valid ? "✓" : "✗"}`);
      if (!validation.valid) {
        console.log(`  Missing: ${validation.missing.join(", ")}`);
      }
    });
}
