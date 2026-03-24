"use strict";

const { buildDecayPolicyAudit } = require("../beliefs/belief-decay-audit");
const {
  buildReportArtifacts,
  buildSummaryOutput,
  collectIntegrationMetrics,
} = require("./introspection-report-builder");

function createIntrospectionStageRegistry(options = {}) {
  const {
    dryRun = false,
    log,
    openclaw,
    workspaceRoot,
    extractBeliefs,
    checkContradictions,
    applyDecay,
    loadBeliefsFile,
    refreshPolicySurface,
    reportBuilder = buildReportArtifacts,
    shouldRunDecayCheck,
    runtimePaths,
    now,
  } = options;

  return {
    belief_extraction: {
      name: "belief_extraction",
      run() {
        log("Running belief extraction...");
        if (dryRun) {
          log("Skipping belief extraction in dry-run mode");
          return { extractionResult: { extracted: 0, skipped: true } };
        }
        return { extractionResult: extractBeliefs({ workspaceRoot }) };
      },
    },
    contradiction_scan: {
      name: "contradiction_scan",
      run() {
        log("Running contradiction detection...");
        if (dryRun) {
          log("Skipping contradiction detection in dry-run mode");
          return {
            contradictionResult: { contradictions_found: 0, skipped: true },
          };
        }
        return { contradictionResult: checkContradictions({ workspaceRoot }) };
      },
    },
    belief_decay: {
      name: "belief_decay",
      run() {
        if (!shouldRunDecayCheck(runtimePaths.decayLogPath, now)) {
          log("Skipping belief decay; recent decay run already recorded");
          return {
            decayResult: {
              decayed: 0,
              skipped: true,
              reason: "recent_decay_run",
            },
          };
        }

        log("Running belief decay...");
        if (dryRun) {
          log("Skipping belief decay mutations in dry-run mode");
          return { decayResult: { decayed: 0, skipped: true } };
        }

        return { decayResult: applyDecay({ workspaceRoot }) };
      },
    },
    decay_policy_audit: {
      name: "decay_policy_audit",
      run() {
        log("Auditing decay policy state...");
        const beliefs = loadBeliefsFile(runtimePaths.beliefsFile);
        return {
          decayAuditResult: {
            audit: buildDecayPolicyAudit(beliefs),
          },
        };
      },
    },
    openclaw_integration_checks: {
      name: "openclaw_integration_checks",
      run() {
        log("Running OpenClaw integration checks...");
        return {
          integrationResult: collectIntegrationMetrics({
            openclaw,
            dryRun,
            log,
          }),
        };
      },
    },
    world_model_refresh: {
      name: "world_model_refresh",
      run() {
        log("Refreshing world-model and action-policy surfaces...");
        return {
          worldModelResult: refreshPolicySurface({
            dryRun,
            log,
            workspaceRoot,
            now,
          }),
        };
      },
    },
    report_generation: {
      name: "report_generation",
      run(context) {
        log("Generating introspection artifacts...");
        return {
          reportResult: reportBuilder(context, { dryRun, log, workspaceRoot }),
        };
      },
    },
    summary_output: {
      name: "summary_output",
      run(context) {
        log("Building introspection summary output...");
        return {
          summary: buildSummaryOutput({
            ...context,
            executedStages: [
              ...(context.executedStages || []),
              "summary_output",
            ],
          }),
        };
      },
    },
  };
}

module.exports = {
  createIntrospectionStageRegistry,
};
