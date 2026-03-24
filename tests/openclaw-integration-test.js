#!/usr/bin/env node
/**
 * OpenClaw Runtime Integration Test
 * Tests actual interaction with OpenClaw native tools
 */

const fs = require("fs").promises;
const path = require("path");
const { DEUSMemory } = require("../src/memory/deus-memory");
const { WORKSPACE_ROOT } = require("../src/workspace/workspace-path");
const {
  DEFAULT_DIAGNOSTICS_HISTORY_LIMIT,
  resolveDiagnosticPaths,
  resolveDiagnosticsDir,
  writeDiagnosticSnapshot,
} = require("../src/runtime/runtime-diagnostics");
const {
  createDeusWorkspaceFixtureSync,
} = require("./helpers/deus-workspace-fixture");

function resolveResultsPath(options = {}) {
  if (options.resultsPath) {
    return options.resultsPath;
  }

  return resolveDiagnosticPaths("openclaw-integration-test", options)
    .latestPath;
}

function resolveCliWorkspaceRoot() {
  return process.env.TEST_WORKSPACE_ROOT || createDeusWorkspaceFixtureSync();
}

async function findLatestMemoryRelativePath(workspaceRoot) {
  const memoryDir = path.join(workspaceRoot, "memory");
  const memoryFiles = await fs.readdir(memoryDir);
  const latestMemoryFile = memoryFiles
    .filter((name) => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
    .sort()
    .pop();

  if (!latestMemoryFile) {
    return null;
  }

  return path.posix.join("memory", latestMemoryFile);
}

class OpenClawIntegrationTest {
  constructor(options = {}) {
    this.workspace = options.workspaceRoot || WORKSPACE_ROOT;
    this.resultsPath = resolveResultsPath(options);
    this.results = [];
  }

  async log(test, success, details = "") {
    const result = {
      test,
      success,
      details,
      timestamp: new Date().toISOString(),
    };
    this.results.push(result);
    const icon = success ? "✓" : "✗";
    console.log(`${icon} ${test}${details ? ": " + details : ""}`);
    return success;
  }

  async run() {
    console.log("\n=== OpenClaw Runtime Integration Test ===\n");

    await this.testNativeToolsDetection();
    await this.testMemorySearch();
    await this.testFallbackSearchEdgeCases();
    await this.testMemoryGet();
    await this.testMemoryWrite();
    await this.testBootstrapSequence();
    await this.printSummary();
  }

  async testNativeToolsDetection() {
    console.log("--- Native Tools Detection ---");

    const hasMemorySearch = typeof memory_search !== "undefined";
    const hasMemoryGet = typeof memory_get !== "undefined";

    await this.log(
      "memory_search mode detected",
      true,
      hasMemorySearch ? "native" : "fallback",
    );
    await this.log(
      "memory_get mode detected",
      true,
      hasMemoryGet ? "native" : "fallback",
    );
  }

  async testMemorySearch() {
    console.log("\n--- Memory Search Test ---");

    const memory = new DEUSMemory({ workspaceRoot: this.workspace });
    const queries = ["Git", "command", "decision"];

    for (const query of queries) {
      try {
        const results = await memory.search(query, { maxResults: 3 });
        await this.log(
          `Search: "${query}"`,
          results.length > 0,
          `${results.length} results`,
        );
      } catch (error) {
        await this.log(`Search: "${query}"`, false, error.message);
      }
    }
  }

  async testFallbackSearchEdgeCases() {
    console.log("\n--- Fallback Search Edge Cases ---");

    const memory = new DEUSMemory({ workspaceRoot: this.workspace });
    const weirdQueries = ["[", "C++", "node.js (test)", ""];

    for (const query of weirdQueries) {
      try {
        const results = await memory.fallbackSearch(query, 3);
        await this.log(
          `Fallback search handles query: "${query}"`,
          Array.isArray(results),
          `${results.length} results`,
        );
      } catch (error) {
        await this.log(
          `Fallback search handles query: "${query}"`,
          false,
          error.message,
        );
      }
    }
  }

  async testMemoryGet() {
    console.log("\n--- Memory Get Test ---");

    const memory = new DEUSMemory({ workspaceRoot: this.workspace });
    const latestMemoryPath = await findLatestMemoryRelativePath(this.workspace);
    const testCases = [
      ...(latestMemoryPath ? [{ path: latestMemoryPath, lines: 5 }] : []),
      { path: "IDENTITY.md", lines: 5 },
      { path: "DEUS.md", lines: 10 },
      { path: "AGENTS.md", from: 1, lines: 5 },
      { path: "SOUL.md", lines: 3 },
    ];

    if (!latestMemoryPath) {
      await this.log(
        "Get: latest memory file discovery",
        false,
        "no dated files found in memory/",
      );
    }

    for (const testCase of testCases) {
      try {
        const content = await memory.get(testCase.path, testCase);
        await this.log(
          `Get: ${testCase.path}`,
          content.length > 0,
          `${content.length} chars`,
        );
      } catch (error) {
        await this.log(`Get: ${testCase.path}`, false, error.message);
      }
    }
  }

  async testMemoryWrite() {
    console.log("\n--- Memory Write Test ---");

    const memory = new DEUSMemory({ workspaceRoot: this.workspace });
    const memoryPath = memory.memoryPath;

    let originalContent = null;
    let existedBeforeTest = false;

    try {
      originalContent = await fs.readFile(memoryPath, "utf8");
      existedBeforeTest = true;
    } catch {
      existedBeforeTest = false;
    }

    try {
      await memory.logEvent("OpenClaw integration test started");
      await this.log("Write: System Event", true);

      await memory.logCommand("test-command --flag");
      await this.log("Write: Command", true);

      const validation = await memory.validateFormat();
      await this.log(
        "Format validation after writes",
        validation.valid,
        validation.valid ? "" : `missing: ${validation.missing.join(", ")}`,
      );
    } catch (error) {
      await this.log("Memory write", false, error.message);
    } finally {
      if (existedBeforeTest) {
        await fs.writeFile(memoryPath, originalContent);
      } else {
        await fs.unlink(memoryPath).catch(() => {});
      }
    }
  }

  async testBootstrapSequence() {
    console.log("\n--- Bootstrap Sequence Test ---");

    const requiredFiles = [
      "SOUL.md",
      "IDENTITY.md",
      "USER.md",
      "DEUS.md",
      "AGENTS.md",
      "beliefs/core.jsonl",
    ];

    for (const file of requiredFiles) {
      try {
        const memory = new DEUSMemory({ workspaceRoot: this.workspace });
        const content = await memory.get(file, { lines: 1 });
        await this.log(`Bootstrap: ${file}`, content.length > 0);
      } catch (error) {
        await this.log(`Bootstrap: ${file}`, false, error.message);
      }
    }
  }

  async printSummary() {
    console.log("\n=== Test Summary ===\n");

    const passed = this.results.filter((result) => result.success).length;
    const total = this.results.length;
    const successRate = ((passed / total) * 100).toFixed(1);

    console.log(`Total: ${total}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${total - passed}`);
    console.log(`Success rate: ${successRate}%`);

    const failed = this.results.filter((result) => !result.success);
    if (failed.length > 0) {
      console.log("\nFailed tests:");
      failed.forEach((result) =>
        console.log(`  ✗ ${result.test}: ${result.details}`),
      );
    }

    const diagnosticsWrite = await writeDiagnosticSnapshot({
      workspaceRoot: this.workspace,
      diagnosticsDir: resolveDiagnosticsDir({ workspaceRoot: this.workspace }),
      name: "openclaw-integration-test",
      payload: {
        timestamp: new Date().toISOString(),
        summary: { total, passed, failed: total - passed, successRate },
        results: this.results,
      },
      historyLimit: DEFAULT_DIAGNOSTICS_HISTORY_LIMIT,
    });

    console.log(
      `\nResults saved to: ${diagnosticsWrite.latestPath} (history dir: ${diagnosticsWrite.historyDir}, limit: ${DEFAULT_DIAGNOSTICS_HISTORY_LIMIT})`,
    );
  }
}

if (require.main === module) {
  const test = new OpenClawIntegrationTest({
    workspaceRoot: resolveCliWorkspaceRoot(),
  });
  test.run().catch(console.error);
}

module.exports = {
  OpenClawIntegrationTest,
  findLatestMemoryRelativePath,
  resolveCliWorkspaceRoot,
  resolveDiagnosticsDir,
  resolveResultsPath,
};
