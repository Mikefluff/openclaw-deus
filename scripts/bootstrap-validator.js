#!/usr/bin/env node
/**
 * DEUS Bootstrap Validator
 * Runs on every OpenClaw session start to validate memory and beliefs
 */

const { DEUSMemory } = require("../src/memory/deus-memory");
const { WORKSPACE_ROOT } = require("../src/workspace/workspace-path");
const {
  DEFAULT_DIAGNOSTICS_HISTORY_LIMIT,
  resolveDiagnosticPaths,
  writeDiagnosticSnapshot,
} = require("../src/runtime/runtime-diagnostics");
const { resolveBeliefsPath } = require("../src/runtime/runtime-surface-paths");
const {
  resolveExistingWorkspaceFilePath,
} = require("../src/workspace/workspace-roots");
const {
  detectEntrypointDrift,
  readEntrypointSnapshot,
} = require("../src/introspection/entrypoint-drift-detector");
const {
  DEFAULT_BOOTSTRAP_ENTRYPOINTS,
} = require("../src/deus/deus-bootstrap-contract");
const fs = require("fs").promises;
const path = require("path");

class BootstrapValidator {
  constructor(options = {}) {
    const {
      workspaceRoot = WORKSPACE_ROOT,
      repair = false,
      writeLog = false,
      memoryFactory = ({ workspaceRoot: root }) =>
        new DEUSMemory({ workspaceRoot: root }),
      entrypointSnapshotReader = (snapshotOptions) =>
        readEntrypointSnapshot(snapshotOptions),
    } = options;

    this.workspace = workspaceRoot;
    this.memoryFactory = memoryFactory;
    this.entrypointSnapshotReader = entrypointSnapshotReader;
    this.options = {
      repair,
      writeLog,
    };
    this.results = {
      timestamp: new Date().toISOString(),
      mode: repair ? "repair" : "check",
      writeLog,
      checks: [],
      entrypointDrift: null,
    };
  }

  createMemory() {
    return this.memoryFactory({ workspaceRoot: this.workspace });
  }

  async log(check, status, details = "") {
    const entry = {
      check,
      status: status ? "✓" : "✗",
      details,
    };
    this.results.checks.push(entry);
    console.log(`${entry.status} ${check}${details ? ": " + details : ""}`);
    return status;
  }

  async validate() {
    console.log("\n=== DEUS Bootstrap Validation ===\n");
    const entrypointSnapshotBefore = this.readEntrypointSnapshot();

    // 1. Check required files exist
    const bootstrapFiles = DEFAULT_BOOTSTRAP_ENTRYPOINTS.filter(
      (relativePath) => relativePath !== "beliefs/core.jsonl",
    );
    for (const relativePath of bootstrapFiles) {
      await this.log(
        `${relativePath} exists`,
        await this.fileExists(relativePath),
      );
    }

    // 2. Check beliefs format
    const beliefsValid = await this.validateBeliefs();
    await this.log("beliefs/core.jsonl format", beliefsValid);

    // 3. Check memory format
    const memoryValid = await this.validateMemoryMode();
    await this.log(
      "memory/YYYY-MM-DD.md format",
      memoryValid.valid,
      this.describeMemoryValidation(memoryValid),
    );

    // 4. Report today's memory file status
    await this.log(
      "Today memory file",
      true,
      this.describeTodayMemory(memoryValid),
    );

    // 5. Test memory tools
    await this.testMemoryTools();

    // 6. Check OpenClaw integration
    await this.checkOpenClawIntegration();

    const entrypointDrift = this.detectEntrypointDrift(
      entrypointSnapshotBefore,
    );
    this.results.entrypointDrift = entrypointDrift;
    await this.log(
      "Entrypoint drift",
      !entrypointDrift.detected,
      entrypointDrift.summary,
    );

    // Save results only when explicitly requested
    await this.log(
      "Validation log persistence",
      true,
      this.options.writeLog
        ? "enabled via --write-log"
        : "skipped in read-only mode",
    );

    if (this.options.writeLog) {
      const diagnosticWrite = await this.saveResults();
      const diagnosticPaths = resolveDiagnosticPaths("bootstrap-validation", {
        workspaceRoot: this.workspace,
      });
      console.log(
        `[DEUS Bootstrap] Diagnostics saved to ${diagnosticWrite.latestPath} (history dir: ${diagnosticPaths.historyDir}, limit: ${DEFAULT_DIAGNOSTICS_HISTORY_LIMIT})`,
      );
    }

    console.log("\n=== Validation Complete ===\n");
    return this.results;
  }

  readEntrypointSnapshot() {
    return this.entrypointSnapshotReader({
      workspaceRoot: this.workspace,
    });
  }

  detectEntrypointDrift(beforeSnapshot) {
    return detectEntrypointDrift(beforeSnapshot, this.readEntrypointSnapshot());
  }

  async validateMemoryMode() {
    const memory = this.createMemory();

    if (this.options.repair) {
      return this.validateMemoryRepair(memory);
    }

    return this.validateMemoryCheck(memory);
  }

  async validateMemoryCheck(memory) {
    return memory.validateFormat({
      createIfMissing: false,
      allowMissing: true,
    });
  }

  async validateMemoryRepair(memory) {
    return memory.validateFormat({
      createIfMissing: true,
      allowMissing: false,
    });
  }

  describeMemoryValidation(memoryValid) {
    if (memoryValid.valid) {
      if (!memoryValid.exists) {
        return "today file missing in check-only mode";
      }
      if (memoryValid.created) {
        return "created via --repair";
      }
      return "";
    }

    return `missing: ${memoryValid.missing.join(", ")}`;
  }

  describeTodayMemory(memoryValid) {
    if (memoryValid.created) {
      return "created via --repair";
    }

    if (memoryValid.exists) {
      return "already exists";
    }

    return "missing (run with --repair to create)";
  }

  async fileExists(relativePath) {
    try {
      await fs.access(
        resolveExistingWorkspaceFilePath(relativePath, {
          workspaceRoot: this.workspace,
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async validateBeliefs() {
    try {
      const content = await fs.readFile(
        resolveBeliefsPath({ workspaceRoot: this.workspace }),
        "utf8",
      );

      const lines = content
        .trim()
        .split("\n")
        .filter((l) => l);
      for (const line of lines) {
        const belief = JSON.parse(line);
        const required = [
          "belief_id",
          "content",
          "confidence",
          "source_type",
          "timestamp_created",
        ];
        for (const field of required) {
          if (!(field in belief)) {
            throw new Error(`Missing field: ${field}`);
          }
        }
      }
      return true;
    } catch (e) {
      console.error(`  Beliefs validation error: ${e.message}`);
      return false;
    }
  }

  async testMemoryTools() {
    const memory = this.createMemory();
    const latestMemoryPath = await this.resolveSampleMemoryPath();

    // Test search
    const searchResults = await memory.search("Git", { maxResults: 1 });
    await this.log(
      "memory_search fallback",
      searchResults.length > 0,
      `${searchResults.length} results (using ${typeof memory_search !== "undefined" ? "native" : "fallback"})`,
    );

    // Test get
    try {
      const content = await memory.get(latestMemoryPath, { lines: 5 });
      await this.log(
        "memory_get fallback",
        content.length > 0,
        `using ${typeof memory_get !== "undefined" ? "native" : "fallback"}`,
      );
    } catch (e) {
      await this.log("memory_get fallback", false, e.message);
    }
  }

  async resolveSampleMemoryPath() {
    const memoryDir = resolveExistingWorkspaceFilePath("memory", {
      workspaceRoot: this.workspace,
    });

    try {
      const entries = await fs.readdir(memoryDir);
      const candidate = entries
        .filter((entry) => entry.endsWith(".md"))
        .sort()
        .pop();
      return candidate ? `memory/${candidate}` : "AGENTS.md";
    } catch {
      return "AGENTS.md";
    }
  }

  async checkOpenClawIntegration() {
    const hasIntegrationFile = await this.fileExists(
      "scripts/openclaw-integration.js",
    );
    await this.log("OpenClaw integration script", hasIntegrationFile);

    const hasMemoryManager = await this.fileExists("src/memory/deus-memory.js");
    await this.log("DEUS memory manager", hasMemoryManager);
  }

  async saveResults() {
    return writeDiagnosticSnapshot({
      workspaceRoot: this.workspace,
      name: "bootstrap-validation",
      payload: this.results,
      historyLimit: DEFAULT_DIAGNOSTICS_HISTORY_LIMIT,
    });
  }
}

function parseCliArgs(argv) {
  const args = new Set(argv);

  return {
    repair: args.has("--repair"),
    writeLog: args.has("--write-log"),
  };
}

// Run if called directly
if (require.main === module) {
  const validator = new BootstrapValidator(parseCliArgs(process.argv.slice(2)));
  validator
    .validate()
    .then((results) => {
      const hasFailures = results.checks.some((check) => check.status === "✗");
      process.exitCode = hasFailures ? 1 : 0;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}

module.exports = { BootstrapValidator, parseCliArgs };
