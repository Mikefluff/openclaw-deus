const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildNightlySummary,
  runDeusNightly,
} = require("../src/deus/deus-nightly-orchestrator");

test("deus nightly orchestrator runs the full ordered maintenance chain", () => {
  const calls = [];
  const packet = {
    reportDate: "2026-03-23",
    artifactPaths: {
      latestFollowupPath: "/tmp/introspection-followup.latest.json",
      reportPath: "/tmp/introspection-2026-03-23.md",
      dataPath: "/tmp/introspection-2026-03-23.json",
    },
    followup: {
      decision: "repair",
      actionMode: "bounded_followup",
      allowedMeasures: ["status_update"],
    },
  };

  const result = runDeusNightly({
    workspaceRoot: "/tmp/deus-workspace",
    now: new Date("2026-03-23T21:00:00.000Z"),
    aggregateMemory(options) {
      calls.push(["memory_aggregate", options.workspaceRoot]);
      return {
        updated: true,
        memoryFile: "/tmp/deus-workspace/memory/2026-03-23.md",
      };
    },
    runSleepCycle(options) {
      calls.push(["sleep", options.workspaceRoot]);
      return {
        status: "ready",
        summary: "bounded sleep cycle ran",
        planner: {
          decision: "sleep_reflection",
          recommendedMode: "sleep_reflection",
        },
        mutations: {
          ran: true,
          plannedTargets: ["logs", "memory", "review", "docs/introspection"],
          introspection: {
            profile: "sleep",
            executedStages: [
              "openclaw_integration_checks",
              "world_model_refresh",
            ],
            pipelineStatus: "ok",
          },
        },
      };
    },
    runIntrospectionPipeline(options) {
      calls.push(["introspect", options.profile, options.workspaceRoot]);
      return {
        executedStages: [
          "belief_extraction",
          "contradiction_scan",
          "belief_decay",
          "decay_policy_audit",
          "openclaw_integration_checks",
          "world_model_refresh",
          "report_generation",
          "summary_output",
        ],
        summary: {
          introspectionProfile: "full",
          pipelineStatus: "ok",
          reportDate: "2026-03-23",
          followup: {
            decision: "repair",
            actionMode: "bounded_followup",
            allowedMeasures: ["status_update"],
          },
          stageFailures: [],
        },
      };
    },
    readLatestIntrospectionFollowupPacket(options) {
      calls.push(["followup_packet", options.workspaceRoot]);
      return packet;
    },
    applyBoundedDecayTuningFromPacket(currentPacket, options) {
      calls.push([
        "decay_tune",
        currentPacket.followup.decision,
        options.actor,
        options.workspaceRoot,
      ]);
      return {
        applied: true,
        dryRun: false,
        reason: null,
        filePath: "/tmp/deus-workspace/beliefs/decay-policy.overrides.json",
        proposal: {
          beliefClass: "self_model",
          updates: { decay_mode: "no_decay" },
          reason: "introspection_decay_tuning:test",
        },
      };
    },
    runBeliefPromotionReview(options) {
      calls.push(["belief_review", options.workspaceRoot]);
      return {
        entries: 4,
        promoted: 2,
        deferred: 1,
        rejected: 1,
        refreshed: 1,
        total_beliefs: 12,
      };
    },
  });

  assert.deepEqual(calls, [
    ["memory_aggregate", "/tmp/deus-workspace"],
    ["sleep", "/tmp/deus-workspace"],
    ["introspect", "full", "/tmp/deus-workspace"],
    ["followup_packet", "/tmp/deus-workspace"],
    [
      "decay_tune",
      "repair",
      "deus_nightly_orchestrator",
      "/tmp/deus-workspace",
    ],
    ["belief_review", "/tmp/deus-workspace"],
  ]);
  assert.deepEqual(result.stageOrder, [
    "memory_aggregate",
    "sleep",
    "introspect",
    "decay_tune",
    "belief_review",
  ]);
  assert.equal(result.followup.decision, "repair");
  assert.equal(
    result.followup.latestPath,
    packet.artifactPaths.latestFollowupPath,
  );
  assert.equal(
    result.stages[0].result.memoryFile,
    "/tmp/deus-workspace/memory/2026-03-23.md",
  );
  assert.equal(result.stages[1].result.mutations.ran, true);
  assert.deepEqual(result.stages[2].result.executedStages, [
    "belief_extraction",
    "contradiction_scan",
    "belief_decay",
    "decay_policy_audit",
    "openclaw_integration_checks",
    "world_model_refresh",
    "report_generation",
    "summary_output",
  ]);
  assert.equal(result.stages[3].result.applied, true);
  assert.equal(result.stages[4].result.promoted, 2);
  assert.match(result.summary, /full-night orchestration completed/);
  assert.match(
    result.summary,
    /bounded sleep reflection ran before full introspection/,
  );
});

test("nightly summary explains when decay tuning is skipped", () => {
  const summary = buildNightlySummary([
    {
      name: "memory_aggregate",
      result: {},
    },
    {
      name: "sleep",
      result: {},
    },
    {
      name: "introspect",
      result: {},
    },
    {
      name: "decay_tune",
      result: {
        applied: false,
        reason: "followup_decision_not_repair",
      },
    },
    {
      name: "belief_review",
      result: {
        promoted: 0,
        refreshed: 3,
      },
    },
  ]);

  assert.match(
    summary,
    /bounded decay tuning skipped \(followup_decision_not_repair\)/,
  );
  assert.match(summary, /0 promoted and 3 refreshed durable beliefs/);
});
