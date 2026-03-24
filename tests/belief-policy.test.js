const test = require("node:test");
const assert = require("node:assert/strict");

const {
  BELIEF_CLASS_DEFAULTS,
  BELIEF_EXTRACTION_POLICY,
  CONSOLIDATION_POLICY,
  classifyIntrospectionPosture,
  decidePromotion,
  getBeliefClassDefaultProfile,
  hasStrongConsolidationSignal,
  inferBeliefClass,
  resolveBeliefDecayProfile,
  selectExtractionConfidence,
  shouldAutoPromoteCandidate,
  shouldRequestLlmAnalysis,
} = require("../src/beliefs/belief-policy");

test("extraction policy centralizes confidence and auto-promotion rules", () => {
  assert.equal(
    selectExtractionConfidence(true),
    BELIEF_EXTRACTION_POLICY.strongSignalConfidence,
  );
  assert.equal(
    selectExtractionConfidence(false),
    BELIEF_EXTRACTION_POLICY.weakSignalConfidence,
  );
  assert.equal(
    shouldAutoPromoteCandidate({
      hasStrongSignal: true,
      explicitMatchLength: 12,
    }),
    true,
  );
  assert.equal(
    shouldAutoPromoteCandidate({
      hasStrongSignal: true,
      explicitMatchLength: 8,
    }),
    false,
  );
});

test("promotion policy centralizes promote, defer, and reject decisions", () => {
  assert.equal(
    decidePromotion({
      recurrence: 4,
      confidence_proposal: 0.7,
      human_review_needed: "no",
    }),
    "promote",
  );
  assert.equal(
    decidePromotion({
      recurrence: 2,
      confidence_proposal: 0.65,
      human_review_needed: "no",
    }),
    "defer",
  );
  assert.equal(
    decidePromotion({
      recurrence: 5,
      confidence_proposal: 0.9,
      human_review_needed: "yes",
    }),
    "defer",
  );
  assert.equal(
    decidePromotion({
      recurrence: 1,
      confidence_proposal: 0.5,
      human_review_needed: "no",
    }),
    "reject",
  );
});

test("introspection and consolidation policy centralize review thresholds", () => {
  assert.equal(classifyIntrospectionPosture(0.9, 0), "stable");
  assert.equal(classifyIntrospectionPosture(0.82, 2), "review");
  assert.equal(classifyIntrospectionPosture(0.6, 1), "repair");
  assert.equal(
    shouldRequestLlmAnalysis({
      coherenceScore: 0.79,
      lowConfidenceCount: 0,
      contradictionsFound: 0,
    }),
    true,
  );
  assert.equal(
    shouldRequestLlmAnalysis({
      coherenceScore: 0.9,
      lowConfidenceCount: 4,
      contradictionsFound: 0,
    }),
    true,
  );
  assert.equal(
    shouldRequestLlmAnalysis({
      coherenceScore: 0.9,
      lowConfidenceCount: 0,
      contradictionsFound: 0,
    }),
    false,
  );
  assert.equal(
    hasStrongConsolidationSignal(CONSOLIDATION_POLICY.patternScoreThreshold),
    true,
  );
  assert.equal(
    hasStrongConsolidationSignal(
      CONSOLIDATION_POLICY.patternScoreThreshold - 1,
    ),
    false,
  );
});

test("decay profile defaults expose explicit class-level policy contracts", () => {
  assert.equal(BELIEF_CLASS_DEFAULTS.axiom.decay_mode, "no_decay");
  assert.equal(BELIEF_CLASS_DEFAULTS.self_model.archivable, false);
  assert.equal(BELIEF_CLASS_DEFAULTS.user_model.confidence_floor, 0.75);
  assert.ok(
    BELIEF_CLASS_DEFAULTS.self_model.review_threshold >
      BELIEF_CLASS_DEFAULTS.self_model.confidence_floor,
  );
  assert.ok(
    BELIEF_CLASS_DEFAULTS.user_model.review_threshold >
      BELIEF_CLASS_DEFAULTS.user_model.confidence_floor,
  );
  assert.deepEqual(getBeliefClassDefaultProfile("operational"), {
    belief_class: "operational",
    decay_mode: "normal",
    confidence_floor: 0.5,
    review_threshold: 0.6,
    archivable: true,
    refresh_strategy: "operational_evidence",
  });
  assert.equal(getBeliefClassDefaultProfile("missing"), null);
});

test("belief class inference prefers explicit class then ID prefix then source fallback", () => {
  assert.equal(
    inferBeliefClass({
      belief_id: "M1",
      source_type: "inference",
      belief_class: "operational",
    }),
    "operational",
  );
  assert.equal(
    inferBeliefClass({
      belief_id: "M1",
      source_type: "inference",
    }),
    "user_model",
  );
  assert.equal(
    inferBeliefClass({
      belief_id: "X1",
      source_type: "self",
    }),
    "self_model",
  );
  assert.equal(
    inferBeliefClass({
      belief_id: "X1",
      source_type: "unknown",
    }),
    "hypothesis",
  );
});

test("effective decay resolver preserves explicit fields and keeps legacy fallback inspectable", () => {
  const explicit = resolveBeliefDecayProfile(
    {
      belief_id: "M1",
      source_type: "inference",
      belief_class: "user_model",
      decay_mode: "normal",
      confidence_floor: 0.82,
      review_threshold: 0.74,
      archivable: false,
      refresh_strategy: "manual_refresh",
    },
    {
      overrides: {
        defaults: { confidence_floor: 0.3 },
        classes: {
          user_model: {
            decay_mode: "slow",
            review_threshold: 0.72,
          },
        },
        beliefs: {
          M1: {
            decay_mode: "fast",
            archivable: true,
          },
        },
      },
    },
  );

  assert.equal(explicit.belief_class, "user_model");
  assert.equal(explicit.decay_mode, "normal");
  assert.equal(explicit.decay_rate, 0.03);
  assert.equal(explicit.confidence_floor, 0.82);
  assert.equal(explicit.review_threshold, 0.74);
  assert.equal(explicit.archivable, false);
  assert.equal(explicit.refresh_strategy, "manual_refresh");
  assert.deepEqual(explicit.resolved_from.override_belief, [
    "decay_mode",
    "archivable",
  ]);
  assert.deepEqual(explicit.resolved_from.explicit_fields, [
    "belief_class",
    "decay_mode",
    "confidence_floor",
    "review_threshold",
    "archivable",
    "refresh_strategy",
  ]);

  const legacy = resolveBeliefDecayProfile({
    belief_id: "R1",
    source_type: "inference",
  });

  assert.equal(legacy.belief_class, "operational");
  assert.equal(legacy.decay_mode, "normal");
  assert.equal(legacy.decay_rate, 0.03);
  assert.equal(legacy.confidence_floor, 0.5);
  assert.equal(legacy.review_threshold, 0.6);
  assert.equal(legacy.archivable, true);
  assert.equal(legacy.refresh_strategy, "operational_evidence");
  assert.deepEqual(legacy.resolved_from.explicit_fields, []);
});
