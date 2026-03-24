"use strict";

const fs = require("fs");
const path = require("path");
const { WORKSPACE_ROOT } = require("../workspace/workspace-path");
const { resolveMemoryDir } = require("../runtime/runtime-surface-paths");
const {
  appendOpenClawIntegrationLog,
  readOpenClawBeliefSnapshot,
  readOpenClawPolicySnapshot,
  readRecentWorkspaceLogs,
} = require("./openclaw-integration-diagnostics");
const { persistOpenClawFlushState } = require("./openclaw-flush-state");

class OpenClawIntegration {
  constructor(options = {}) {
    const workspaceRoot = options.workspaceRoot || WORKSPACE_ROOT;

    this.workspace = workspaceRoot;
    this.flushCallbacks = [];
    this.logger =
      options.logger ||
      ((message) => appendOpenClawIntegrationLog(message, { workspaceRoot }));
    this.beliefSnapshotReader =
      options.beliefSnapshotReader ||
      (() => readOpenClawBeliefSnapshot({ workspaceRoot }));
    this.recentLogsReader =
      options.recentLogsReader ||
      ((count) => readRecentWorkspaceLogs({ workspaceRoot, count }));
    this.policySurfaceReader =
      options.policySurfaceReader ||
      (() => readOpenClawPolicySnapshot({ workspaceRoot }));
    this.flushStateWriter =
      options.flushStateWriter ||
      ((flushData) => persistOpenClawFlushState({ workspaceRoot, flushData }));
    this.memorySearchDetector = options.memorySearchDetector;
    this.memorySearchAvailable = this.detectMemorySearch();
  }

  detectMemorySearch() {
    if (typeof this.memorySearchDetector === "function") {
      return this.memorySearchDetector();
    }

    try {
      if (typeof memory_search !== "undefined") {
        this.log("Native memory_search detected");
        return true;
      }

      const hasMemCore = fs.existsSync(
        path.join(this.workspace, ".openclaw", "memory"),
      );
      if (hasMemCore) {
        this.log("Memory core plugin detected");
      }

      return false;
    } catch {
      return false;
    }
  }

  async searchMemory(query, options = {}) {
    const { top_k = 5, useNative = true } = options;

    if (useNative && this.memorySearchAvailable) {
      try {
        this.log(`Would use native memory_search for: ${query}`);
      } catch (error) {
        this.log(`Native search failed, using fallback: ${error.message}`);
      }
    }

    return this.fallbackSearch(query, top_k);
  }

  fallbackSearch(query, topK) {
    const results = [];
    const memoryDir = resolveMemoryDir({ workspaceRoot: this.workspace });

    if (!fs.existsSync(memoryDir)) {
      return results;
    }

    const files = fs
      .readdirSync(memoryDir)
      .filter((file) => file.endsWith(".md"));
    const terms = query.toLowerCase().split(" ").filter(Boolean);

    if (terms.length === 0) {
      return [];
    }

    for (const file of files) {
      const content = fs.readFileSync(path.join(memoryDir, file), "utf8");
      const lowerContent = content.toLowerCase();

      let score = 0;
      for (const term of terms) {
        if (lowerContent.includes(term)) {
          score += 1;
        }
      }

      if (score > 0) {
        results.push({
          file,
          score: score / terms.length,
          snippet: content.substring(0, 500),
        });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  validateMemorySearchEffectiveness() {
    this.log("Validating memory search effectiveness...");

    const testQueries = [
      { query: "Git commit", expectedSection: "Git Activity" },
      { query: "command executed", expectedSection: "Commands" },
      { query: "decision made", expectedSection: "Decisions" },
      { query: "system event", expectedSection: "Events" },
    ];

    const results = [];
    for (const { query, expectedSection } of testQueries) {
      const searchResults = this.fallbackSearch(query, 3);
      const hasExpectedSection = searchResults.some(
        (result) =>
          result.snippet.includes(`## ${expectedSection}`) ||
          result.snippet.includes(expectedSection),
      );

      results.push({
        query,
        expectedSection,
        found: searchResults.length > 0,
        hasExpectedSection,
      });
    }

    const successRate =
      results.filter((result) => result.found && result.hasExpectedSection)
        .length / results.length;
    this.log(`Memory search effectiveness: ${(successRate * 100).toFixed(1)}%`);

    return results;
  }

  registerFlushCallback(callback) {
    this.flushCallbacks.push(callback);
    this.log("Registered flush callback");
  }

  buildFlushData(reason = "proactive") {
    return {
      timestamp: new Date().toISOString(),
      reason,
      beliefSnapshot: this.getBeliefSnapshot(),
      recentLogs: this.getRecentLogs(10),
      policySurface: this.getPolicySurface(),
    };
  }

  async previewFlush(reason = "diagnostic") {
    this.log(`Flush preview requested: ${reason}`);
    return this.buildFlushData(reason);
  }

  async triggerFlush(reason = "proactive") {
    this.log(`Flush triggered: ${reason}`);
    const flushData = this.buildFlushData(reason);

    for (const callback of this.flushCallbacks) {
      try {
        await callback(flushData);
      } catch (error) {
        this.log(`Flush callback error: ${error.message}`);
      }
    }

    this.flushStateWriter(flushData);
    return flushData;
  }

  getBeliefSnapshot() {
    return this.beliefSnapshotReader();
  }

  getRecentLogs(count) {
    return this.recentLogsReader(count);
  }

  getPolicySurface() {
    return this.policySurfaceReader();
  }

  log(message) {
    this.logger(message);
    console.log(`[OpenClaw Integration] ${message}`);
  }
}

const integration = new OpenClawIntegration();

module.exports = integration;
module.exports.OpenClawIntegration = OpenClawIntegration;
