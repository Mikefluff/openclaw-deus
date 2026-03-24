"use strict";

const { aggregateAll } = require("../memory/daily-memory-aggregation");

function defaultMemoryAggregate(options = {}) {
  return aggregateAll(undefined, options);
}

function summarizeMemoryAggregate(result) {
  return {
    updated: Boolean(result?.updated),
    memoryFile: result?.memoryFile || null,
  };
}

function summarizeSleep(result) {
  return {
    status: result?.status || null,
    summary: result?.summary || null,
    planner: {
      decision: result?.planner?.decision || null,
      recommendedMode: result?.planner?.recommendedMode || null,
    },
    mutations: {
      ran: Boolean(result?.mutations?.ran),
      plannedTargets: result?.mutations?.plannedTargets || [],
      introspection: result?.mutations?.introspection || null,
    },
  };
}

function summarizeIntrospection(result) {
  return {
    profile: result?.summary?.introspectionProfile || "full",
    pipelineStatus: result?.summary?.pipelineStatus || null,
    executedStages: result?.executedStages || [],
    reportDate: result?.summary?.reportDate || null,
    stageFailures: result?.summary?.stageFailures || [],
    followup: result?.summary?.followup
      ? {
          decision: result.summary.followup.decision || null,
          actionMode: result.summary.followup.actionMode || null,
          allowedMeasures: result.summary.followup.allowedMeasures || [],
        }
      : null,
  };
}

function summarizeDecayTuning(result) {
  return {
    applied: Boolean(result?.applied),
    dryRun: Boolean(result?.dryRun),
    reason: result?.reason || null,
    filePath: result?.filePath || null,
    proposal: result?.proposal
      ? {
          beliefClass: result.proposal.beliefClass || null,
          updates: result.proposal.updates || null,
          reason: result.proposal.reason || null,
        }
      : null,
  };
}

function summarizeBeliefReview(result) {
  return {
    entries: result?.entries ?? 0,
    promoted: result?.promoted ?? 0,
    deferred: result?.deferred ?? 0,
    rejected: result?.rejected ?? 0,
    refreshed: result?.refreshed ?? 0,
    totalBeliefs: result?.total_beliefs ?? null,
  };
}

function buildNightlySummary(stageResults) {
  const sleepStage = stageResults.find((stage) => stage.name === "sleep");
  const decayStage = stageResults.find((stage) => stage.name === "decay_tune");
  const beliefReviewStage = stageResults.find(
    (stage) => stage.name === "belief_review",
  );

  let sleepSummary = "bounded sleep reflection stage completed";
  if (sleepStage?.result?.status === "ready") {
    sleepSummary = "bounded sleep reflection ran before full introspection";
  } else if (sleepStage?.result?.status === "blocked") {
    sleepSummary =
      "bounded sleep reflection stayed in preparation mode before full introspection";
  } else if (sleepStage?.result?.status === "skipped") {
    sleepSummary =
      "bounded sleep reflection was skipped before full introspection";
  }

  const decaySummary = decayStage?.result?.applied
    ? "bounded decay tuning applied one runtime override patch"
    : `bounded decay tuning skipped${
        decayStage?.result?.reason ? ` (${decayStage.result.reason})` : ""
      }`;
  const promoted = beliefReviewStage?.result?.promoted ?? 0;
  const refreshed = beliefReviewStage?.result?.refreshed ?? 0;

  return [
    "full-night orchestration completed",
    "daily logs were aggregated into memory before reflection",
    sleepSummary,
    decaySummary,
    `belief review finished with ${promoted} promoted and ${refreshed} refreshed durable beliefs`,
  ].join("; ");
}

module.exports = {
  buildNightlySummary,
  defaultMemoryAggregate,
  summarizeBeliefReview,
  summarizeDecayTuning,
  summarizeIntrospection,
  summarizeMemoryAggregate,
  summarizeSleep,
};
