import { Injectable } from '@nestjs/common';
import { CalibratedProbability, calibrated, EvidenceQuality } from '../common/types/cognitive.types';

/** Evidence quality multiplier for Bayesian updates */
const EVIDENCE_WEIGHTS: Record<EvidenceQuality, number> = {
  explicit_statement: 0.9,
  strong_implication: 0.6,
  behavioral_pattern: 0.4,
  weak_inference: 0.2,
};

@Injectable()
export class BayesianUpdaterService {
  /**
   * Beta-Binomial posterior for belief confidence.
   * Models belief as "how many times confirmed vs total observations."
   */
  betaPosterior(successes: number, total: number): CalibratedProbability {
    // Beta(alpha, beta) where alpha = successes + 1, beta = failures + 1 (Laplace prior)
    const alpha = successes + 1;
    const beta_ = (total - successes) + 1;
    const mean = alpha / (alpha + beta_);
    // 90% credible interval approximation
    const variance = (alpha * beta_) / ((alpha + beta_) ** 2 * (alpha + beta_ + 1));
    const spread = 1.645 * Math.sqrt(variance); // z=1.645 for 90% CI
    return calibrated(mean, spread);
  }

  /**
   * Update confidence given new evidence.
   * Uses likelihood ratio approach:
   *   posterior ∝ likelihood × prior
   *   boost = evidenceQuality × (1 - current) × learningRate
   * Diminishing returns: high-confidence beliefs get smaller boosts.
   */
  updateWithEvidence(
    currentConfidence: number,
    evidenceQuality: EvidenceQuality,
    evidenceCount: number,
  ): CalibratedProbability {
    const weight = EVIDENCE_WEIGHTS[evidenceQuality];
    const learningRate = 0.3;
    const boost = weight * (1 - currentConfidence) * learningRate;
    const newConfidence = Math.min(1.0, currentConfidence + boost);

    // Spread narrows with more evidence (more certain)
    const spread = 0.15 / Math.sqrt(1 + evidenceCount);
    return calibrated(newConfidence, spread);
  }

  /**
   * Evidence-weighted decay rate.
   * More evidence → slower decay (belief is well-supported).
   */
  evidenceWeightedDecayRate(baseRate: number, evidenceCount: number): number {
    return baseRate / Math.log2(1 + Math.max(1, evidenceCount));
  }

  /**
   * Context-aware decay multiplier.
   * Different types of knowledge decay at different rates.
   */
  contextDecayMultiplier(scope: string): number {
    const CONTEXT_RATES: Record<string, number> = {
      tools: 1.5,           // tool preferences change fast
      technical: 1.2,
      communication: 0.8,
      workflow: 1.0,
      values: 0.3,          // core values are stable
      constraint: 0.5,
      personal: 0.4,
      domain_knowledge: 0.6,
    };
    return CONTEXT_RATES[scope] ?? 1.0;
  }

  /**
   * Bayesian prior floor based on belief class and evidence history.
   * Replaces fixed confidence_floor.
   */
  computePrior(beliefClass: string, evidenceCount: number): number {
    const BASE_PRIORS: Record<string, number> = {
      axiom: 1.0,
      self_model: 0.85,
      user_model: 0.6,
      operational: 0.4,
      hypothesis: 0.2,
    };
    const base = BASE_PRIORS[beliefClass] ?? 0.3;
    // More evidence raises the prior floor
    const evidenceBoost = Math.min(0.15, evidenceCount * 0.02);
    return Math.min(0.95, base + evidenceBoost);
  }

  /**
   * Reinforcement boost with diminishing returns.
   */
  reinforcementBoost(
    currentConfidence: number,
    evidenceQuality: EvidenceQuality,
  ): number {
    const weight = EVIDENCE_WEIGHTS[evidenceQuality];
    return Math.min(0.1, weight * (1.0 - currentConfidence) * 0.3);
  }
}
