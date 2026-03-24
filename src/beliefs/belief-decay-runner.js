"use strict";

const { appendDeusOpsLog } = require("../deus/deus-ops-log");
const { loadBeliefs, saveBeliefs } = require("./belief-decay-store");
const {
  applyLifecycleTransition,
} = require("./belief-decay-transitions");
const {
  applyDecay,
  refreshBelief,
  repairDecayExemptBelief,
} = require("./belief-decay-profile");

function log(message, options = {}) {
  appendDeusOpsLog({
    component: "belief-decay",
    message,
    workspaceRoot: options.workspaceRoot,
  });
}

function main(options = {}) {
  log("Starting belief decay process...", options);

  const beliefs = loadBeliefs(options);
  let decayed = 0;
  let refreshed = 0;
  let archived = 0;
  let deprecated = 0;
  let flagged = 0;
  let restoredExempt = 0;

  const updatedBeliefs = beliefs.map((belief) => {
    const exemptRepair = repairDecayExemptBelief(belief);
    if (exemptRepair.repaired) {
      restoredExempt++;
      log(`RESTORED decay-exempt belief: ${belief.belief_id}`, options);
      return exemptRepair.belief;
    }

    const result = applyDecay(belief);
    const lifecycleTransition = applyLifecycleTransition(belief, result);

    if (result.changed) {
      decayed++;
    }

    if (lifecycleTransition.changed) {
      if (lifecycleTransition.nextStatus === "review_needed") {
        flagged++;
        log(
          `FLAGGED for review: ${belief.belief_id} (confidence: ${belief.confidence}, class: ${result.profile.belief_class})`,
          options,
        );
      }

      if (lifecycleTransition.nextStatus === "deprecated") {
        deprecated++;
        log(
          `DEPRECATED: ${belief.belief_id} (confidence: ${belief.confidence}, class: ${result.profile.belief_class})`,
          options,
        );
      }

      if (lifecycleTransition.nextStatus === "archived") {
        archived++;
        log(
          `ARCHIVED: ${belief.belief_id} (confidence: ${belief.confidence}, class: ${result.profile.belief_class})`,
          options,
        );
      }
    }

    return belief;
  });

  saveBeliefs(updatedBeliefs, options);

  const stats = {
    timestamp: new Date().toISOString(),
    total_beliefs: beliefs.length,
    decayed,
    flagged,
    deprecated,
    archived,
    restored_exempt: restoredExempt,
    refreshed,
    avg_confidence:
      updatedBeliefs.reduce((sum, belief) => sum + belief.confidence, 0) /
      updatedBeliefs.length,
  };

  log(
    `Decay complete: ${decayed} decayed, ${flagged} flagged, ${deprecated} deprecated, ${archived} archived, ${restoredExempt} restored_exempt`,
    options,
  );
  console.log(JSON.stringify(stats, null, 2));

  return stats;
}

module.exports = {
  log,
  main,
};
