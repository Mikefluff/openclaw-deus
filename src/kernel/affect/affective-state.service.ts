import { Injectable, Logger } from '@nestjs/common';
import { CognitiveConfigService } from '../../cognitive/cognitive-config.service';
import { CommitDelta, PhenomenalState, TimeSense } from '../kernel.types';

/**
 * AffectiveStateService: Homeostatic hormone system.
 *
 * NOT keyword matching. NOT sentiment analysis.
 * This is a continuous homeostatic loop: cognitive events → hormone levels → behavior modulation.
 *
 * Hormones modulate learnable kernel parameters in REAL TIME:
 * - High cortisol → conservative: increase convergence_threshold, decrease spread_factor
 * - High dopamine → explorative: decrease convergence_threshold, increase spread_factor
 * - High norepinephrine → alert: decrease energy_stable_threshold, more agents engage
 * - High serotonin → stable: increase archive_threshold, slower decay
 *
 * The system FEELS before it THINKS. Affect modulates cognition.
 */

export interface HormoneLevels {
  cortisol: number;        // 0-1: stress (prediction errors, unresolved tensions)
  dopamine: number;        // 0-1: reward (successful predictions, completions)
  norepinephrine: number;  // 0-1: alertness (novelty, surprises)
  serotonin: number;       // 0-1: stability (world model confidence, low contradictions)
}

export interface Pain {
  intensity: number;       // 0-1: current pain level
  source: string;          // what's causing pain
  chronic: boolean;        // persistent vs acute
}

export interface AffectiveSnapshot {
  hormones: HormoneLevels;
  pain: Pain;
  valence: number;         // -1..1: overall mood (suffering ↔ thriving)
  arousal: number;         // 0-1: energy level (torpid ↔ activated)
  mode: 'explore' | 'exploit' | 'defensive' | 'resting';
}

// Hormone half-lives (in cognitive cycles) — how fast they decay toward baseline
const HALF_LIVES = {
  cortisol: 8,           // stress lingers
  dopamine: 3,           // reward fades fast
  norepinephrine: 2,     // alertness is fleeting
  serotonin: 15,         // stability is slow-moving
};

// Baseline levels (homeostatic set-points)
const BASELINES = {
  cortisol: 0.2,
  dopamine: 0.3,
  norepinephrine: 0.2,
  serotonin: 0.5,
};

@Injectable()
export class AffectiveStateService {
  private readonly logger = new Logger(AffectiveStateService.name);

  private hormones: HormoneLevels = { ...BASELINES };
  private pain: Pain = { intensity: 0, source: 'none', chronic: false };
  private cyclesSincePainSource = 0;

  constructor(private readonly config: CognitiveConfigService) {}

  /**
   * Process commits from a kernel cycle and update hormonal state.
   * Called AFTER each cycle — affect trails cognition by one cycle.
   */
  processCommits(commits: CommitDelta[], timeSense: TimeSense): void {
    // === CORTISOL: rises with prediction errors + unresolved tensions ===
    const avgPredError = commits.length > 0
      ? commits.reduce((s, c) => s + c.prediction_error, 0) / commits.length
      : 0;
    const escalations = commits.filter(c => c.is_escalation).length;
    const cortisolStimulus = avgPredError * 0.4 + escalations * 0.2 + this.pain.intensity * 0.3;
    this.stimulate('cortisol', cortisolStimulus);

    // === DOPAMINE: rises with successful convergence + low energy (stability) ===
    const convergentCommits = commits.filter(c => c.convergence_score > 0.5);
    const lowEnergy = commits.filter(c => c.energy < 0.1);
    const dopamineStimulus = convergentCommits.length * 0.2 + lowEnergy.length * 0.15;
    this.stimulate('dopamine', dopamineStimulus);

    // === NOREPINEPHRINE: rises with novelty ===
    const avgNovelty = commits.length > 0
      ? commits.reduce((s, c) => s + c.novelty_cost, 0) / commits.length
      : 0;
    this.stimulate('norepinephrine', avgNovelty * 0.6);

    // === SEROTONIN: rises when dilation is low (routine, predictable) ===
    const predictability = 1 - timeSense.novelty_rate;
    this.stimulate('serotonin', predictability * 0.1);

    // === PAIN: prediction error IS pain ===
    if (avgPredError > 0.3) {
      this.pain.intensity = Math.min(1, avgPredError);
      this.pain.source = 'prediction_error';
      this.cyclesSincePainSource = 0;
    } else {
      this.cyclesSincePainSource++;
      // Pain decays if source resolved
      this.pain.intensity *= 0.7;
      if (this.pain.intensity < 0.05) {
        this.pain = { intensity: 0, source: 'none', chronic: false };
      }
    }
    // Chronic: pain persists > 5 cycles
    if (this.cyclesSincePainSource > 5 && this.pain.intensity > 0.2) {
      this.pain.chronic = true;
    }

    // Decay all hormones toward baseline
    this.decayAll();

    // MODULATE kernel parameters based on hormonal state
    this.modulateConfig();
  }

  /**
   * Get current affective snapshot — for phenomenal state.
   */
  getSnapshot(): AffectiveSnapshot {
    const valence = (this.hormones.dopamine + this.hormones.serotonin)
      - (this.hormones.cortisol + this.pain.intensity);
    const arousal = (this.hormones.norepinephrine + this.hormones.cortisol) / 2;

    let mode: AffectiveSnapshot['mode'];
    if (this.hormones.cortisol > 0.6) mode = 'defensive';
    else if (this.hormones.dopamine > 0.5 && this.hormones.norepinephrine > 0.3) mode = 'explore';
    else if (arousal < 0.2) mode = 'resting';
    else mode = 'exploit';

    return {
      hormones: { ...this.hormones },
      pain: { ...this.pain },
      valence: Math.max(-1, Math.min(1, Math.round(valence * 100) / 100)),
      arousal: Math.max(0, Math.min(1, Math.round(arousal * 100) / 100)),
      mode,
    };
  }

  /**
   * External pain injection — for explicit negative signals.
   * "This is wrong", "ошибка", operator frustration.
   */
  inflictPain(source: string, intensity: number): void {
    this.pain.intensity = Math.min(1, this.pain.intensity + intensity);
    this.pain.source = source;
    this.cyclesSincePainSource = 0;
    this.stimulate('cortisol', intensity * 0.5);
  }

  /**
   * External reward — for explicit positive signals.
   * "Отлично", successful episode, operator satisfaction.
   */
  reward(intensity: number): void {
    this.stimulate('dopamine', intensity);
    this.pain.intensity *= (1 - intensity * 0.5); // reward reduces pain
  }

  // ═══════════════════════════════════════════
  // PRIVATE
  // ═══════════════════════════════════════════

  /**
   * Stimulate a hormone: push it toward 1.0.
   */
  private stimulate(hormone: keyof HormoneLevels, amount: number): void {
    const current = this.hormones[hormone];
    // Diminishing returns: the higher the level, the less effect
    const effective = amount * (1 - current * 0.5);
    this.hormones[hormone] = Math.min(1, current + effective);
  }

  /**
   * Decay all hormones toward their baselines.
   * Exponential decay with hormone-specific half-lives.
   */
  private decayAll(): void {
    for (const [hormone, halfLife] of Object.entries(HALF_LIVES)) {
      const key = hormone as keyof HormoneLevels;
      const baseline = BASELINES[key];
      const decay = Math.log(2) / halfLife;
      const current = this.hormones[key];
      // Exponential approach to baseline
      this.hormones[key] = baseline + (current - baseline) * Math.exp(-decay);
      this.hormones[key] = Math.round(this.hormones[key] * 1000) / 1000;
    }
  }

  /**
   * MODULATE kernel parameters based on hormonal state.
   * This is the homeostatic loop: hormones → behavior → outcomes → hormones.
   */
  private modulateConfig(): void {
    const h = this.hormones;

    // CORTISOL (stress) → conservative behavior
    if (h.cortisol > 0.5) {
      // High stress: narrow focus, be careful
      this.config.adjust('kernel.convergence_threshold', 0.02, 'cortisol_high: being cautious');
      this.config.adjust('kernel.spread_factor', -0.01, 'cortisol_high: narrowing activation');
      this.config.adjust('kernel.freshness_decay', 0.002, 'cortisol_high: faster forgetting of stressful memories');
    }

    // DOPAMINE (reward) → explorative behavior
    if (h.dopamine > 0.5) {
      // High reward: explore, be adventurous
      this.config.adjust('kernel.convergence_threshold', -0.02, 'dopamine_high: exploring more');
      this.config.adjust('kernel.spread_factor', 0.01, 'dopamine_high: broader activation');
      this.config.adjust('kernel.hebbian_learning_rate', 0.005, 'dopamine_high: learning faster');
    }

    // NOREPINEPHRINE (alertness) → engaged, sensitive
    if (h.norepinephrine > 0.5) {
      // High alertness: lower thresholds, notice more
      this.config.adjust('kernel.energy_stable_threshold', -0.005, 'norepinephrine_high: staying alert');
      this.config.adjust('kernel.activation_boost', 0.01, 'norepinephrine_high: sensitized');
    }

    // SEROTONIN (stability) → tolerant, patient
    if (h.serotonin > 0.6) {
      // High stability: relax thresholds, tolerate ambiguity
      this.config.adjust('kernel.archive_threshold', -0.001, 'serotonin_high: preserving more memories');
      this.config.adjust('kernel.hallucination_cycles', 0.5, 'serotonin_high: more patience with self-reflection');
    }

    // PAIN → immediate learning signal
    if (this.pain.intensity > 0.5) {
      // Pain: boost learning from errors
      this.config.adjust('kernel.pred_error_backprop_rate', 0.01, 'pain: learning from errors');
      this.config.adjust('kernel.reinforcement_rate', 0.01, 'pain: strengthening avoidance');
    }
  }
}
