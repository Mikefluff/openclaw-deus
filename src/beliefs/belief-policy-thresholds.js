"use strict";

const INTROSPECTION_POLICY = Object.freeze({
  lowConfidenceThreshold: 0.7,
  confidentBeliefThreshold: 0.8,
  stableReflectionThreshold: 0.85,
  reviewThreshold: 0.8,
  llmAnalysisLowConfidenceCount: 3,
});

const BELIEF_EXTRACTION_POLICY = Object.freeze({
  strongSignalConfidence: 0.8,
  weakSignalConfidence: 0.6,
  existingBeliefSimilarityThreshold: 0.7,
  reinforcementBoost: 0.03,
  autoPromoteMinExplicitMatchLength: 10,
  reviewAction: "review_before_promotion",
});

const CONSOLIDATION_POLICY = Object.freeze({
  patternScoreThreshold: 3,
  confidenceProposal: 0.65,
  defaultPromotionDecision: "review_before_promotion",
});

const BELIEF_PROMOTION_POLICY = Object.freeze({
  existingBeliefSimilarityThreshold: 0.7,
  humanReviewValue: "yes",
  promote: Object.freeze({
    minRecurrence: 3,
    minConfidenceProposal: 0.6,
  }),
  defer: Object.freeze({
    exactRecurrence: 2,
    minConfidenceProposal: 0.65,
  }),
});

function similarityExceedsThreshold(similarity, threshold) {
  return similarity > threshold;
}

function selectExtractionConfidence(
  hasStrongSignal,
  policy = BELIEF_EXTRACTION_POLICY,
) {
  return hasStrongSignal
    ? policy.strongSignalConfidence
    : policy.weakSignalConfidence;
}

function shouldAutoPromoteCandidate(
  { hasStrongSignal, explicitMatchLength },
  policy = BELIEF_EXTRACTION_POLICY,
) {
  return (
    hasStrongSignal &&
    explicitMatchLength > policy.autoPromoteMinExplicitMatchLength
  );
}

function hasStrongConsolidationSignal(score, policy = CONSOLIDATION_POLICY) {
  return score >= policy.patternScoreThreshold;
}

function decidePromotion(entry, policy = BELIEF_PROMOTION_POLICY) {
  if (entry.human_review_needed === policy.humanReviewValue) {
    return "defer";
  }

  if (
    entry.recurrence >= policy.promote.minRecurrence &&
    entry.confidence_proposal >= policy.promote.minConfidenceProposal
  ) {
    return "promote";
  }

  if (
    entry.recurrence === policy.defer.exactRecurrence &&
    entry.confidence_proposal >= policy.defer.minConfidenceProposal
  ) {
    return "defer";
  }

  return "reject";
}

function classifyIntrospectionPosture(
  coherenceScore,
  lowConfidenceCount,
  policy = INTROSPECTION_POLICY,
) {
  if (
    coherenceScore > policy.stableReflectionThreshold &&
    lowConfidenceCount === 0
  ) {
    return "stable";
  }

  if (coherenceScore > policy.reviewThreshold) {
    return "review";
  }

  return "repair";
}

function shouldRequestLlmAnalysis(
  { coherenceScore, lowConfidenceCount, contradictionsFound },
  policy = INTROSPECTION_POLICY,
) {
  return (
    coherenceScore < policy.reviewThreshold ||
    lowConfidenceCount > policy.llmAnalysisLowConfidenceCount ||
    contradictionsFound > 0
  );
}

module.exports = {
  BELIEF_EXTRACTION_POLICY,
  BELIEF_PROMOTION_POLICY,
  CONSOLIDATION_POLICY,
  INTROSPECTION_POLICY,
  classifyIntrospectionPosture,
  decidePromotion,
  hasStrongConsolidationSignal,
  selectExtractionConfidence,
  shouldAutoPromoteCandidate,
  shouldRequestLlmAnalysis,
  similarityExceedsThreshold,
};
