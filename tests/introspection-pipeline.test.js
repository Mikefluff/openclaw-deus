const test = require("node:test");
const assert = require("node:assert/strict");

const {
  FULL_INTROSPECTION_STAGE_NAMES,
  INTROSPECTION_STAGE_NAMES,
  SLEEP_INTROSPECTION_STAGE_NAMES,
  checkUncommittedChanges,
  generateDailyMemory,
  parsePorcelainStatusEntries,
  runIntrospectionPipeline,
  shouldRunDecay,
} = require("../src/introspection/introspection-pipeline");

function createSampleDecayAudit() {
  return {
    totalBeliefs: 2,
    byClass: {
      self_model: {
        count: 2,
        avgConfidence: 0.75,
        pinnedAtFloorCount: 2,
        activeFloorPressureCount: 2,
        reviewNeededCount: 2,
        activeReviewNeededCount: 2,
        archivedCount: 0,
        nonArchivableCount: 2,
        modeCounts: { slow: 2 },
        dominantDecayMode: "slow",
      },
    },
    byMode: { slow: 2 },
    byStatus: { active: 2 },
    pinnedAtFloor: [
      {
        beliefId: "G1",
        beliefClass: "self_model",
        confidence: 0.75,
        confidenceFloor: 0.75,
        status: "active",
      },
      {
        beliefId: "G2",
        beliefClass: "self_model",
        confidence: 0.75,
        confidenceFloor: 0.75,
        status: "active",
      },
    ],
    activeFloorPressure: [
      {
        beliefId: "G1",
        beliefClass: "self_model",
        confidence: 0.75,
        confidenceFloor: 0.75,
        decayMode: "slow",
        status: "active",
      },
      {
        beliefId: "G2",
        beliefClass: "self_model",
        confidence: 0.75,
        confidenceFloor: 0.75,
        decayMode: "slow",
        status: "active",
      },
    ],
    archivedNonArchivable: [],
    criticalAtRisk: [
      {
        beliefId: "G1",
        beliefClass: "self_model",
        confidence: 0.75,
        reviewThreshold: 0.8,
        confidenceFloor: 0.75,
        decayMode: "slow",
        status: "active",
      },
      {
        beliefId: "G2",
        beliefClass: "self_model",
        confidence: 0.75,
        reviewThreshold: 0.8,
        confidenceFloor: 0.75,
        decayMode: "slow",
        status: "active",
      },
    ],
    tuningCandidates: [
      {
        kind: "review_floor_binding",
        scope: "class",
        beliefClass: "self_model",
        dominantDecayMode: "slow",
        suggestedDecayMode: "no_decay",
        affectedBeliefCount: 2,
        reason:
          "2 active beliefs are pinned to the class floor under a decaying mode",
      },
    ],
    tuningSuggested: true,
  };
}

function createSampleAuditBeliefs() {
  return [
    {
      belief_id: "G1",
      confidence: 0.75,
      status: "active",
      source_type: "inference",
      belief_class: "self_model",
      decay_mode: "slow",
      confidence_floor: 0.75,
      review_threshold: 0.8,
      archivable: false,
    },
    {
      belief_id: "G2",
      confidence: 0.75,
      status: "active",
      source_type: "inference",
      belief_class: "self_model",
      decay_mode: "slow",
      confidence_floor: 0.75,
      review_threshold: 0.8,
      archivable: false,
    },
  ];
}

test("introspection pipeline executes the explicit named stages in order", () => {
  const seen = [];
  const decayAudit = createSampleDecayAudit();
  const openclaw = {
    memorySearchAvailable: true,
    flushCallbacks: [],
    validateMemorySearchEffectiveness() {
      seen.push("validateMemorySearchEffectiveness");
      return [
        { found: true, hasExpectedSection: true },
        { found: true, hasExpectedSection: true },
      ];
    },
    registerFlushCallback(callback) {
      seen.push("registerFlushCallback");
      this.flushCallbacks.push(callback);
    },
  };

  const result = runIntrospectionPipeline({
    dryRun: false,
    openclaw,
    extractBeliefs() {
      seen.push("extractBeliefs");
      return { extracted: 4 };
    },
    checkContradictions() {
      seen.push("checkContradictions");
      return { contradictions_found: 1 };
    },
    applyDecay() {
      seen.push("applyDecay");
      return { decayed: 2 };
    },
    shouldRunDecayCheck() {
      return true;
    },
    loadBeliefsFile() {
      return createSampleAuditBeliefs();
    },
    reportBuilder(context) {
      seen.push("reportBuilder");
      assert.deepEqual(
        context.executedStages,
        INTROSPECTION_STAGE_NAMES.slice(0, 6),
      );
      return {
        coherence: 0.84,
        beliefs: 7,
        memory: { today: true, yesterday: true },
        activity: { today: 3, yesterday: 2, byType: { event: 3 } },
        llm_needed: true,
        policyFeedback: {
          totalEvents: 2,
          blockedEvaluations: 1,
        },
        decayAudit,
      };
    },
    refreshPolicySurface: () => {
      seen.push("refreshPolicySurface");
      return {
        worldModel: {
          confidence: 0.81,
          fresh: true,
          activeProject: "deus",
        },
        focusState: {
          status: "active",
          mode: "working",
          currentFocus: "ship focus-state surface",
          followThroughAllowed: true,
        },
        sleepPlanner: {
          decision: "cron_follow_through",
          recommendedMode: "cron_follow_through",
          summary:
            "active follow-through takes precedence over sleep reflection",
        },
        actionPolicy: {
          decision: "prepare_conditions",
          recommendedMode: "prepare_conditions",
        },
      };
    },
  });

  assert.deepEqual(result.executedStages, FULL_INTROSPECTION_STAGE_NAMES);
  assert.deepEqual(seen, [
    "extractBeliefs",
    "checkContradictions",
    "applyDecay",
    "validateMemorySearchEffectiveness",
    "registerFlushCallback",
    "refreshPolicySurface",
    "reportBuilder",
  ]);
  assert.deepEqual(result.summary, {
    introspectionProfile: "full",
    executedStages: FULL_INTROSPECTION_STAGE_NAMES,
    coherence: 0.84,
    beliefs: 7,
    memory: { today: true, yesterday: true },
    activity: { today: 3, yesterday: 2, byType: { event: 3 } },
    llm_needed: true,
    memorySearchEffectiveness: 1,
    openclawIntegration: {
      memorySearchAvailable: true,
      flushCallbacksRegistered: 1,
    },
    worldModel: {
      confidence: 0.81,
      fresh: true,
      activeProject: "deus",
    },
    focusState: {
      status: "active",
      mode: "working",
      currentFocus: "ship focus-state surface",
      followThroughAllowed: true,
    },
    sleepPlanner: {
      decision: "cron_follow_through",
      recommendedMode: "cron_follow_through",
      summary: "active follow-through takes precedence over sleep reflection",
    },
    actionPolicy: {
      decision: "prepare_conditions",
      recommendedMode: "prepare_conditions",
    },
    policyFeedback: {
      totalEvents: 2,
      blockedEvaluations: 1,
    },
    decayAudit,
    followup: null,
    beliefProcessing: {
      extracted: 4,
      contradictions: 1,
      decayed: 2,
    },
    pipelineStatus: "ok",
    stageFailures: [],
  });
});

test("sleep introspection profile excludes belief-processing stages entirely", () => {
  const seen = [];
  const result = runIntrospectionPipeline({
    profile: "sleep",
    dryRun: false,
    loadBeliefsFile() {
      return createSampleAuditBeliefs();
    },
    extractBeliefs() {
      seen.push("extractBeliefs");
      return { extracted: 4 };
    },
    checkContradictions() {
      seen.push("checkContradictions");
      return { contradictions_found: 1 };
    },
    applyDecay() {
      seen.push("applyDecay");
      return { decayed: 2 };
    },
    openclaw: {
      memorySearchAvailable: true,
      flushCallbacks: [],
      validateMemorySearchEffectiveness() {
        seen.push("validateMemorySearchEffectiveness");
        return [{ found: true, hasExpectedSection: true }];
      },
      registerFlushCallback(callback) {
        seen.push("registerFlushCallback");
        this.flushCallbacks.push(callback);
      },
    },
    refreshPolicySurface() {
      seen.push("refreshPolicySurface");
      return {
        worldModel: {
          confidence: 0.72,
          fresh: true,
        },
        focusState: {
          status: "idle",
          mode: "sleep_reflection",
        },
        sleepPlanner: {
          decision: "sleep_reflection",
          recommendedMode: "sleep_reflection",
        },
        actionPolicy: {
          decision: "observe",
          recommendedMode: "observe",
        },
      };
    },
    reportBuilder(context) {
      seen.push("reportBuilder");
      assert.deepEqual(
        context.executedStages,
        SLEEP_INTROSPECTION_STAGE_NAMES.slice(0, 2),
      );
      return {
        coherence: 0.91,
        beliefs: 5,
        memory: { today: true, yesterday: true },
        activity: { today: 2, yesterday: 1, byType: { event: 2 } },
        llm_needed: false,
        policyFeedback: {},
      };
    },
  });

  assert.deepEqual(result.executedStages, SLEEP_INTROSPECTION_STAGE_NAMES);
  assert.deepEqual(seen, [
    "validateMemorySearchEffectiveness",
    "registerFlushCallback",
    "refreshPolicySurface",
    "reportBuilder",
  ]);
  assert.equal(result.summary.introspectionProfile, "sleep");
  assert.deepEqual(
    result.summary.executedStages,
    SLEEP_INTROSPECTION_STAGE_NAMES,
  );
  assert.deepEqual(result.summary.beliefProcessing, {
    extracted: 0,
    contradictions: 0,
    decayed: 0,
  });
});

test("dry-run mode preserves the summary shape without mutating stage counters", () => {
  const result = runIntrospectionPipeline({
    dryRun: true,
    loadBeliefsFile() {
      return [];
    },
    openclaw: {
      memorySearchAvailable: false,
      flushCallbacks: [],
      fallbackSearch() {
        return [];
      },
    },
    refreshPolicySurface() {
      return {
        worldModel: {
          confidence: 0.5,
          fresh: false,
        },
        focusState: {
          status: "waiting",
          mode: "idle",
          waitingFor: "review",
          followThroughAllowed: false,
        },
        sleepPlanner: {
          decision: "sleep_reflection",
          recommendedMode: "sleep_reflection",
          quietHours: { active: true },
        },
        actionPolicy: {
          decision: "wait",
          recommendedMode: "wait",
        },
      };
    },
    reportBuilder() {
      return {
        coherence: 1,
        beliefs: 5,
        memory: { today: false, yesterday: false },
        activity: { today: 0, yesterday: 0, byType: {} },
        llm_needed: false,
        policyFeedback: {},
      };
    },
  });

  assert.deepEqual(Object.keys(result.summary), [
    "introspectionProfile",
    "executedStages",
    "coherence",
    "beliefs",
    "memory",
    "activity",
    "llm_needed",
    "memorySearchEffectiveness",
    "openclawIntegration",
    "worldModel",
    "focusState",
    "sleepPlanner",
    "actionPolicy",
    "policyFeedback",
    "decayAudit",
    "followup",
    "beliefProcessing",
    "pipelineStatus",
    "stageFailures",
  ]);
  assert.equal(result.summary.introspectionProfile, "full");
  assert.deepEqual(
    result.summary.executedStages,
    FULL_INTROSPECTION_STAGE_NAMES,
  );
  assert.deepEqual(result.summary.beliefProcessing, {
    extracted: 0,
    contradictions: 0,
    decayed: 0,
  });
  assert.deepEqual(result.summary.worldModel, {
    confidence: 0.5,
    fresh: false,
  });
  assert.deepEqual(result.summary.focusState, {
    status: "waiting",
    mode: "idle",
    waitingFor: "review",
    followThroughAllowed: false,
  });
  assert.deepEqual(result.summary.sleepPlanner, {
    decision: "sleep_reflection",
    recommendedMode: "sleep_reflection",
    quietHours: { active: true },
  });
  assert.deepEqual(result.summary.actionPolicy, {
    decision: "wait",
    recommendedMode: "wait",
  });
  assert.deepEqual(result.summary.policyFeedback, {});
  assert.equal(result.summary.followup, null);
  assert.equal(result.summary.pipelineStatus, "ok");
  assert.deepEqual(result.summary.stageFailures, []);
});

test("pipeline stays degraded-but-running when one stage throws", () => {
  const seen = [];
  const result = runIntrospectionPipeline({
    dryRun: false,
    extractBeliefs() {
      seen.push("extractBeliefs");
      return { extracted: 2 };
    },
    checkContradictions() {
      seen.push("checkContradictions");
      throw new Error("CONTRADICTION_STAGE_FAILED");
    },
    applyDecay() {
      seen.push("applyDecay");
      return { decayed: 1 };
    },
    refreshPolicySurface() {
      seen.push("refreshPolicySurface");
      return {
        worldModel: {
          confidence: 0.4,
          fresh: false,
        },
        focusState: {
          status: "waiting",
          mode: "idle",
          warnings: ["waiting_without_blocker"],
        },
        sleepPlanner: {
          decision: "prepare_conditions",
          readiness: { blockers: ["missing_recent_evidence"] },
        },
        actionPolicy: {
          decision: "observe",
          recommendedMode: "observe",
        },
      };
    },
    shouldRunDecayCheck() {
      return true;
    },
    openclaw: {
      memorySearchAvailable: false,
      flushCallbacks: [],
      validateMemorySearchEffectiveness() {
        seen.push("validateMemorySearchEffectiveness");
        return [{ found: false, hasExpectedSection: false }];
      },
      registerFlushCallback(callback) {
        seen.push("registerFlushCallback");
        this.flushCallbacks.push(callback);
      },
    },
    reportBuilder() {
      seen.push("reportBuilder");
      return {
        coherence: 0.5,
        beliefs: 3,
        memory: { today: true, yesterday: false },
        activity: { today: 1, yesterday: 0, byType: { event: 1 } },
        llm_needed: true,
        policyFeedback: {
          totalEvents: 1,
          blockedEvaluations: 0,
        },
      };
    },
  });

  assert.deepEqual(seen, [
    "extractBeliefs",
    "checkContradictions",
    "applyDecay",
    "validateMemorySearchEffectiveness",
    "registerFlushCallback",
    "refreshPolicySurface",
    "reportBuilder",
  ]);
  assert.equal(result.summary.pipelineStatus, "degraded");
  assert.deepEqual(result.summary.stageFailures, [
    {
      stage: "contradiction_scan",
      message: "CONTRADICTION_STAGE_FAILED",
    },
  ]);
  assert.deepEqual(result.summary.beliefProcessing, {
    extracted: 2,
    contradictions: 0,
    decayed: 1,
  });
  assert.deepEqual(result.summary.worldModel, {
    confidence: 0.4,
    fresh: false,
  });
  assert.deepEqual(result.summary.focusState, {
    status: "waiting",
    mode: "idle",
    warnings: ["waiting_without_blocker"],
  });
  assert.deepEqual(result.summary.sleepPlanner, {
    decision: "prepare_conditions",
    readiness: { blockers: ["missing_recent_evidence"] },
  });
  assert.deepEqual(result.summary.actionPolicy, {
    decision: "observe",
    recommendedMode: "observe",
  });
  assert.deepEqual(result.summary.policyFeedback, {
    totalEvents: 1,
    blockedEvaluations: 0,
  });
  assert.equal(result.summary.followup, null);
  assert.deepEqual(result.executedStages, FULL_INTROSPECTION_STAGE_NAMES);
});

test("parsePorcelainStatusEntries parses NUL-delimited git porcelain output", () => {
  const output =
    " M src/introspection/introspection-pipeline.js\u0000R  old.txt -> new.txt\u0000";

  assert.deepEqual(parsePorcelainStatusEntries(output), [
    " M src/introspection/introspection-pipeline.js",
    "R  old.txt -> new.txt",
  ]);
});

test("checkUncommittedChanges uses tracked-only porcelain git status flags", () => {
  const seen = [];
  const entries = checkUncommittedChanges(process.cwd(), (command) => {
    seen.push(command);
    return Buffer.from(" M src/introspection/introspection-pipeline.js\u0000");
  });

  assert.deepEqual(entries, [" M src/introspection/introspection-pipeline.js"]);
  assert.deepEqual(seen, ["git status --porcelain -z --untracked-files=no"]);
});

test("generateDailyMemory forwards workspaceRoot and day key into aggregation", () => {
  const seen = [];
  const result = generateDailyMemory({
    dateStr: "2026-03-21",
    workspaceRoot: "/tmp/deus-fixture",
    log() {},
    aggregateLogs(dateStr, options) {
      seen.push({ dateStr, options });
    },
  });

  assert.deepEqual(result, { skipped: false });
  assert.deepEqual(seen, [
    {
      dateStr: "2026-03-21",
      options: { workspaceRoot: "/tmp/deus-fixture" },
    },
  ]);
});

test("shouldRunDecay resolves a default path without throwing", () => {
  assert.equal(typeof shouldRunDecay(), "boolean");
});
