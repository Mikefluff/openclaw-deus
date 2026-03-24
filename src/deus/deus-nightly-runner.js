"use strict";

const { applyBoundedDecayTuningFromPacket } = require("../policy/deus-decay-tuning");
const {
  readLatestIntrospectionFollowupPacket,
} = require("../introspection/deus-introspection-followup");
const { runBeliefPromotionReview } = require("../beliefs/belief-promotion-review");
const { runIntrospectionPipeline } = require("../introspection/introspection-pipeline");
const { runSleepCycle } = require("./deus-sleep-cycle");
const { WORKSPACE_ROOT } = require("../workspace/workspace-path");
const {
  buildNightlySummary,
  defaultMemoryAggregate,
  summarizeBeliefReview,
  summarizeDecayTuning,
  summarizeIntrospection,
  summarizeMemoryAggregate,
  summarizeSleep,
} = require("./deus-nightly-stage-summary");

function runDeusNightly(options = {}) {
  const workspaceRoot = options.workspaceRoot || WORKSPACE_ROOT;
  const now = options.now || new Date();
  const actor = options.actor || "deus_nightly_orchestrator";
  const aggregateMemory = options.aggregateMemory || defaultMemoryAggregate;
  const sleepCycle = options.runSleepCycle || runSleepCycle;
  const introspection =
    options.runIntrospectionPipeline || runIntrospectionPipeline;
  const readFollowupPacket =
    options.readLatestIntrospectionFollowupPacket ||
    readLatestIntrospectionFollowupPacket;
  const applyDecayTuning =
    options.applyBoundedDecayTuningFromPacket ||
    applyBoundedDecayTuningFromPacket;
  const beliefReview =
    options.runBeliefPromotionReview || runBeliefPromotionReview;

  const stageResults = [];

  const memoryAggregateResult = aggregateMemory({
    workspaceRoot,
    now,
  });
  stageResults.push({
    name: "memory_aggregate",
    status: "ok",
    result: summarizeMemoryAggregate(memoryAggregateResult),
  });

  const sleepResult = sleepCycle({
    workspaceRoot,
    now,
  });
  stageResults.push({
    name: "sleep",
    status: sleepResult?.status || "ok",
    result: summarizeSleep(sleepResult),
  });

  const introspectionResult = introspection({
    workspaceRoot,
    now,
    profile: "full",
  });
  stageResults.push({
    name: "introspect",
    status: introspectionResult?.summary?.pipelineStatus || "ok",
    result: summarizeIntrospection(introspectionResult),
  });

  const followupPacket = readFollowupPacket({
    workspaceRoot,
  });
  const decayTuningResult = applyDecayTuning(followupPacket, {
    actor,
    now,
    workspaceRoot,
  });
  stageResults.push({
    name: "decay_tune",
    status: decayTuningResult?.applied ? "applied" : "skipped",
    result: summarizeDecayTuning(decayTuningResult),
  });

  const beliefReviewResult = beliefReview({
    workspaceRoot,
  });
  stageResults.push({
    name: "belief_review",
    status: "ok",
    result: summarizeBeliefReview(beliefReviewResult),
  });

  return {
    timestamp: new Date(now).toISOString(),
    workspaceRoot,
    summary: buildNightlySummary(stageResults),
    followup: {
      decision: followupPacket?.followup?.decision || null,
      reportDate: followupPacket?.reportDate || null,
      latestPath: followupPacket?.artifactPaths?.latestFollowupPath || null,
      reportPath: followupPacket?.artifactPaths?.reportPath || null,
      dataPath: followupPacket?.artifactPaths?.dataPath || null,
    },
    stageOrder: stageResults.map((stage) => stage.name),
    stages: stageResults,
  };
}

module.exports = {
  runDeusNightly,
};
