"use strict";

const GOVERNANCE_DIRECTIVES = Object.freeze({
  beliefs: Object.freeze({
    I1: Object.freeze({
      belief_class: "axiom",
      decay_mode: "no_decay",
      confidence_floor: 1.0,
      review_threshold: 1.0,
      archivable: false,
      refresh_strategy: "axiom_integrity",
    }),
    I2: Object.freeze({
      belief_class: "axiom",
      decay_mode: "no_decay",
      confidence_floor: 1.0,
      review_threshold: 1.0,
      archivable: false,
      refresh_strategy: "axiom_integrity",
    }),
    I3: Object.freeze({
      belief_class: "axiom",
      decay_mode: "no_decay",
      confidence_floor: 1.0,
      review_threshold: 1.0,
      archivable: false,
      refresh_strategy: "axiom_integrity",
    }),
    I4: Object.freeze({
      belief_class: "axiom",
      decay_mode: "no_decay",
      confidence_floor: 1.0,
      review_threshold: 1.0,
      archivable: false,
      refresh_strategy: "axiom_integrity",
    }),
    I5: Object.freeze({
      belief_class: "axiom",
      decay_mode: "no_decay",
      confidence_floor: 1.0,
      review_threshold: 1.0,
      archivable: false,
      refresh_strategy: "axiom_integrity",
    }),
    G1: Object.freeze({
      belief_class: "self_model",
      decay_mode: "slow",
      confidence_floor: 0.9,
      review_threshold: 0.9,
      archivable: false,
      refresh_strategy: "goal_reinforcement",
      repair_target: 0.9,
      repair_status: "active",
      critical: true,
    }),
    G2: Object.freeze({
      belief_class: "self_model",
      decay_mode: "slow",
      confidence_floor: 0.9,
      review_threshold: 0.9,
      archivable: false,
      refresh_strategy: "self_reflection",
      repair_target: 0.9,
      repair_status: "active",
      critical: true,
    }),
    M1: Object.freeze({
      belief_class: "user_model",
      decay_mode: "slow",
      confidence_floor: 0.75,
      review_threshold: 0.8,
      archivable: false,
      refresh_strategy: "interaction_reinforcement",
      repair_target: 0.8,
      repair_status: "active",
      critical: true,
    }),
    M2: Object.freeze({
      belief_class: "hypothesis",
      decay_mode: "normal",
      confidence_floor: 0.2,
      review_threshold: 0.55,
      archivable: true,
      refresh_strategy: "evidence_refresh",
    }),
    M3: Object.freeze({
      belief_class: "hypothesis",
      decay_mode: "normal",
      confidence_floor: 0.2,
      review_threshold: 0.55,
      archivable: true,
      refresh_strategy: "evidence_refresh",
    }),
    M4: Object.freeze({
      belief_class: "user_model",
      decay_mode: "slow",
      confidence_floor: 0.7,
      review_threshold: 0.75,
      archivable: false,
      refresh_strategy: "interaction_reinforcement",
      repair_target: 0.75,
      repair_status: "active",
      critical: true,
    }),
    S1: Object.freeze({
      belief_class: "self_model",
      decay_mode: "no_decay",
      confidence_floor: 0.95,
      review_threshold: 0.95,
      archivable: false,
      refresh_strategy: "identity_integrity",
      repair_target: 0.95,
      repair_status: "active",
      critical: true,
    }),
    S2: Object.freeze({
      belief_class: "hypothesis",
      decay_mode: "normal",
      confidence_floor: 0.2,
      review_threshold: 0.55,
      archivable: true,
      refresh_strategy: "evidence_refresh",
    }),
    S3: Object.freeze({
      belief_class: "self_model",
      decay_mode: "no_decay",
      confidence_floor: 0.9,
      review_threshold: 0.9,
      archivable: false,
      refresh_strategy: "protocol_integrity",
      repair_target: 0.9,
      repair_status: "active",
      critical: true,
    }),
  }),
});

function cloneDirective(directive) {
  return directive ? { ...directive } : null;
}

function getBeliefGovernanceDirective(beliefId) {
  return cloneDirective(GOVERNANCE_DIRECTIVES.beliefs[beliefId]);
}

module.exports = {
  GOVERNANCE_DIRECTIVES,
  cloneDirective,
  getBeliefGovernanceDirective,
};
