import { Injectable } from '@nestjs/common';
import { CalibratedProbability, calibrated, EvidenceQuality } from '../common/types/cognitive.types';
import { CognitiveConfigService } from './cognitive-config.service';

@Injectable()
export class BayesianUpdaterService {
  constructor(private readonly config: CognitiveConfigService) {}

  private getEvidenceWeight(quality: EvidenceQuality): number {
    const map: Record<EvidenceQuality, string> = {
      explicit_statement: 'evidence.explicit_statement',
      strong_implication: 'evidence.strong_implication',
      behavioral_pattern: 'evidence.behavioral_pattern',
      weak_inference: 'evidence.weak_inference',
    };
    return this.config.get(map[quality]);
  }

  betaPosterior(successes: number, total: number): CalibratedProbability {
    const alpha = successes + 1;
    const beta_ = (total - successes) + 1;
    const mean = alpha / (alpha + beta_);
    const variance = (alpha * beta_) / ((alpha + beta_) ** 2 * (alpha + beta_ + 1));
    const z = this.config.get('bayesian.ci_z_score');
    const spread = z * Math.sqrt(variance);
    return calibrated(mean, spread);
  }

  updateWithEvidence(
    currentConfidence: number,
    evidenceQuality: EvidenceQuality,
    evidenceCount: number,
  ): CalibratedProbability {
    const weight = this.getEvidenceWeight(evidenceQuality);
    const learningRate = this.config.get('bayesian.learning_rate');
    const boost = weight * (1 - currentConfidence) * learningRate;
    const newConfidence = Math.min(1.0, currentConfidence + boost);
    const spread = 0.15 / Math.sqrt(1 + evidenceCount);
    return calibrated(newConfidence, spread);
  }

  evidenceWeightedDecayRate(baseRate: number, evidenceCount: number): number {
    return baseRate / Math.log2(1 + Math.max(1, evidenceCount));
  }

  contextDecayMultiplier(scope: string): number {
    const key = `context_decay.${scope}`;
    return this.config.get(key) || 1.0;
  }

  computePrior(beliefClass: string, evidenceCount: number): number {
    const BASE_PRIORS: Record<string, number> = {
      axiom: 1.0, self_model: 0.85, user_model: 0.6,
      operational: 0.4, hypothesis: 0.2,
      fact: 0.5, inference: 0.3, procedural: 0.6, meta: 0.4,
    };
    const base = BASE_PRIORS[beliefClass] ?? 0.3;
    const evidenceBoost = Math.min(0.15, evidenceCount * 0.02);
    return Math.min(0.95, base + evidenceBoost);
  }

  reinforcementBoost(currentConfidence: number, evidenceQuality: EvidenceQuality): number {
    const weight = this.getEvidenceWeight(evidenceQuality);
    const cap = this.config.get('bayesian.reinforcement_boost_cap');
    return Math.min(cap, weight * (1.0 - currentConfidence) * this.config.get('bayesian.learning_rate'));
  }
}
