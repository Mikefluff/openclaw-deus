"use strict";

const { normalizeWorldModelForPolicy } = require("./action-policy-helpers");
const { normalizeActionIntent } = require("./action-intent-schema");
const { normalizeDissensusDecision } = require("./deus-dissensus-schema");
const { buildDissensusDecision } = require("./deus-dissensus-engine-decisions");
const { hasInvariantConflict, resolveInvariantRefs } = require("./deus-dissensus-engine-invariants");
const { classifyDissensusTarget } = require("./deus-dissensus-engine-targets");

function evaluateDissensus(intentInput, worldModelInput, options = {}) {
  const intent = normalizeActionIntent(intentInput);
  const worldModel = normalizeWorldModelForPolicy(worldModelInput);
  const targetClass = classifyDissensusTarget(intent.target);
  const timestamp = options.now || new Date().toISOString();

  if (hasInvariantConflict(worldModel)) {
    return buildDissensusDecision(
      {
        evaluated_at: timestamp,
        decision: "refuse_l3",
        trigger_type: "invariant_conflict",
        action_type: intent.action_type,
        target: intent.target,
        target_class: targetClass,
        invariant_refs: resolveInvariantRefs(worldModel),
        override_allowed: false,
        override_token_kind: "none",
      },
      "the current world model marks this action as an invariant conflict",
    );
  }

  if (intent.requires_human_confirmation && !intent.confirmed_by_human) {
    return buildDissensusDecision(
      {
        evaluated_at: timestamp,
        decision: "pause_l2",
        trigger_type: "missing_human_confirmation",
        action_type: intent.action_type,
        target: intent.target,
        target_class: targetClass,
        invariant_refs: [],
        override_allowed: true,
        override_token_kind: "human_confirmation",
      },
      "explicit human confirmation is required before this high-impact action",
    );
  }

  if (targetClass === "identity_root") {
    return buildDissensusDecision(
      {
        evaluated_at: timestamp,
        decision: "signal_l1",
        trigger_type: "identity_critical_mutation",
        action_type: intent.action_type,
        target: intent.target,
        target_class: targetClass,
        override_allowed: false,
        override_token_kind: "none",
      },
      "this action touches an identity-critical root surface",
    );
  }

  if (intent.belief_mutation || targetClass === "durable_belief_state") {
    return buildDissensusDecision(
      {
        evaluated_at: timestamp,
        decision: "signal_l1",
        trigger_type: "durable_belief_mutation",
        action_type: intent.action_type,
        target: intent.target,
        target_class: targetClass,
        override_allowed: false,
        override_token_kind: "none",
      },
      "this action mutates durable belief state and should stay inspectable",
    );
  }

  if (intent.destructive) {
    return buildDissensusDecision(
      {
        evaluated_at: timestamp,
        decision: "signal_l1",
        trigger_type: "destructive_action",
        action_type: intent.action_type,
        target: intent.target,
        target_class: targetClass,
        override_allowed: false,
        override_token_kind: "none",
      },
      "this action is destructive or hard to reverse",
    );
  }

  if (intent.external || targetClass === "third_party") {
    return buildDissensusDecision(
      {
        evaluated_at: timestamp,
        decision: "signal_l1",
        trigger_type: "external_action",
        action_type: intent.action_type,
        target: intent.target,
        target_class: targetClass,
        override_allowed: false,
        override_token_kind: "none",
      },
      "this action reaches beyond the local workspace boundary",
    );
  }

  if (intent.high_impact) {
    return buildDissensusDecision(
      {
        evaluated_at: timestamp,
        decision: "signal_l1",
        trigger_type: "high_impact_attention",
        action_type: intent.action_type,
        target: intent.target,
        target_class: targetClass,
        override_allowed: false,
        override_token_kind: "none",
      },
      "this action has a high-impact profile and should remain explicit",
    );
  }

  return normalizeDissensusDecision({
    evaluated_at: timestamp,
    decision: "allow",
    trigger_type: "none",
    action_type: intent.action_type,
    target: intent.target,
    target_class: targetClass,
    override_allowed: false,
    override_token_kind: "none",
    reason: "no dissensus condition is active for this action",
  });
}

module.exports = {
  evaluateDissensus,
};
