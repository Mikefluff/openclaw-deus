const { WORKSPACE_ROOT } = require("../workspace/workspace-path");
const {
  resolveMemoryDir,
  resolveMemoryPath,
  resolveMemoryWritePath,
} = require("../runtime/runtime-surface-paths");
const { getWorkspaceDateContext } = require("../workspace/workspace-date-context");
const { DAILY_MEMORY_SECTIONS } = require("./daily-memory-schema");
const { fallbackGet, fallbackSearch } = require("./deus-memory-file-fallback");
const {
  addEntry,
  createLogMethods,
  ensureDailyMemoryDocument,
  initToday,
} = require("./deus-memory-file-mutation");
const { validateFormat } = require("./deus-memory-file-validation");

class DEUSMemoryFileStore {
  constructor(options = {}) {
    const {
      workspaceRoot = WORKSPACE_ROOT,
      dateContextProvider = getWorkspaceDateContext,
    } = options;

    this.workspace = workspaceRoot;
    this.memoryDir = resolveMemoryDir({ workspaceRoot });
    this.dateContextProvider = dateContextProvider;
    this.logMethods = createLogMethods(this);
  }

  getDateContext() {
    return this.dateContextProvider();
  }

  getMemoryPathForDay(dayKey) {
    return resolveMemoryPath(dayKey, { workspaceRoot: this.workspace });
  }

  getActiveMemoryTarget() {
    const dateContext = this.getDateContext();

    return {
      dateContext,
      today: dateContext.today,
      memoryPath: resolveMemoryWritePath(dateContext.today, {
        workspaceRoot: this.workspace,
      }),
    };
  }

  get today() {
    return this.getActiveMemoryTarget().today;
  }

  get memoryPath() {
    return this.getActiveMemoryTarget().memoryPath;
  }

  async fallbackSearch(query, maxResults) {
    return fallbackSearch(this, query, maxResults);
  }

  async fallbackGet(filePath, from, lines) {
    return fallbackGet(this, filePath, from, lines);
  }

  async ensureDailyMemoryDocument(target = this.getActiveMemoryTarget()) {
    return ensureDailyMemoryDocument(this, target);
  }

  async initToday(target = this.getActiveMemoryTarget()) {
    return initToday(this, target);
  }

  async addEntry(section, entry) {
    return addEntry(this, section, entry);
  }

  async logGit(activity) {
    return this.logMethods.logGit(activity);
  }

  async logCommand(command) {
    return this.logMethods.logCommand(command);
  }

  async logDecision(decision, reasoning) {
    return this.logMethods.logDecision(decision, reasoning);
  }

  async logInteraction(description) {
    return this.logMethods.logInteraction(description);
  }

  async logEvent(event) {
    return this.logMethods.logEvent(event);
  }

  async validateFormat(options = {}) {
    return validateFormat(this, options);
  }
}

module.exports = {
  DAILY_MEMORY_SECTIONS,
  DEUSMemoryFileStore,
};
