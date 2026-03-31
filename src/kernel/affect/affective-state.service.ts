import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { SurrealService } from '../../database/surreal.service';
import { CognitiveConfigService } from '../../cognitive/cognitive-config.service';
import { CommitDelta, TimeSense } from '../kernel.types';

/**
 * AffectiveStateService: Learned homeostatic affect via neural GRAPH.
 *
 * Architecture: all weights live as nn_edge records in SurrealDB.
 *   acc nodes (7) ──nn_edge──> hormone nodes (4) ──nn_edge──> config nodes (6)
 *                                                └─nn_edge──> mode nodes (4)
 *
 * Forward pass = graph traversal (fn::nn_forward in SurrealDB/Rust)
 * Backward pass = edge weight update (fn::nn_backward_layer in SurrealDB/Rust)
 *
 * JS only does: accumulator arithmetic + loss computation + calling graph ops.
 */

const N_ACCUMULATORS = 7;
const N_HORMONES = 4;
const N_MODES = 4;
const N_CONFIG_TARGETS = 6;

const ACC_NAMES = ['pred_error', 'tension', 'pain', 'convergence', 'reward', 'novelty', 'stability'];
const HORMONE_NAMES = ['cortisol', 'dopamine', 'norepinephrine', 'serotonin'];
const CONFIG_NAMES = ['convergence_threshold', 'spread_factor', 'hebbian_lr', 'energy_threshold', 'activation_boost', 'freshness_decay'];
const MODE_NAMES = ['explore', 'exploit', 'defensive', 'resting'];

const CONFIG_TARGETS = [
  'kernel.convergence_threshold',
  'kernel.spread_factor',
  'kernel.hebbian_learning_rate',
  'kernel.energy_stable_threshold',
  'kernel.activation_boost',
  'kernel.freshness_decay',
];

export interface HormoneLevels {
  cortisol: number;
  dopamine: number;
  norepinephrine: number;
  serotonin: number;
}

export interface Pain {
  intensity: number;
  source: string;
  chronic: boolean;
  accumulator: number;
  cycles_unresolved: number;
}

export interface AffectiveSnapshot {
  hormones: HormoneLevels;
  pain: Pain;
  valence: number;
  arousal: number;
  mode: 'explore' | 'exploit' | 'defensive' | 'resting';
  mode_probabilities: number[];
  loss: number;
}

@Injectable()
export class AffectiveStateService implements OnModuleInit {
  private readonly logger = new Logger(AffectiveStateService.name);

  // Raw accumulators (running state — still JS, pure arithmetic)
  private acc: number[] = new Array(N_ACCUMULATORS).fill(0);
  private painCyclesUnresolved = 0;
  private lastPainSource = 'none';
  private lastLoss = 0;
  private stepCount = 0;

  // Cached from last forward pass (read from graph)
  private lastHormones: number[] = new Array(N_HORMONES).fill(0.5);
  private lastConfigDeltas: number[] = new Array(N_CONFIG_TARGETS).fill(0);
  private lastModeProbs: number[] = new Array(N_MODES).fill(0.25);

  constructor(
    private readonly db: SurrealService,
    private readonly config: CognitiveConfigService,
  ) {}

  onModuleInit(): void {
    // Zero async — defaults are fine. DB load deferred to first processCommits.
  }

  // ═══════════════════════════════════════════
  // FORWARD PASS: graph traversal in SurrealDB
  // ═══════════════════════════════════════════

  async processCommits(commits: CommitDelta[], timeSense: TimeSense): Promise<{ configDeltas: Map<string, number> }> {
    // 1. Update accumulators from system dynamics (JS arithmetic)
    this.updateAccumulators(commits, timeSense);

    // 2. Forward pass: graph traversal (Rust)
    await this.forward();

    // 3. Compute loss
    const loss = this.computeLoss();

    // 4. Backward pass: edge weight update (Rust)
    await this.backward(loss);

    // 5. Build config deltas
    const deltas = new Map<string, number>();
    for (let i = 0; i < N_CONFIG_TARGETS; i++) {
      if (Math.abs(this.lastConfigDeltas[i]) > 0.0001) {
        deltas.set(CONFIG_TARGETS[i], this.lastConfigDeltas[i]);
      }
    }

    this.lastLoss = loss;
    return { configDeltas: deltas };
  }

  private async forward(): Promise<void> {
    // Set accumulator values in graph
    const inputValues = ACC_NAMES.map((name, i) => ({
      node_id: `acc:${name}`,
      value: this.acc[i],
    }));

    await this.db.execute(
      'RETURN fn::nn_set_inputs($values)',
      { values: inputValues },
    );

    // Layer 1: accumulators → hormones (graph traversal)
    const hormoneResult = await this.db.query<{ node_id: string; value: number }>(
      'RETURN fn::nn_forward("affect", "input", "hidden")',
    );
    if (hormoneResult.isOk()) {
      for (const row of hormoneResult.value) {
        const idx = HORMONE_NAMES.indexOf(row.node_id.replace('hormone:', ''));
        if (idx >= 0) this.lastHormones[idx] = row.value;
      }
    }

    // Layer 2: hormones → config targets (graph traversal)
    const configResult = await this.db.query<{ node_id: string; value: number }>(
      'RETURN fn::nn_forward("affect", "hidden", "output")',
    );
    if (configResult.isOk()) {
      const deltaMax = this.config.get('affect.config_delta_max');
      for (const row of configResult.value) {
        const idx = CONFIG_NAMES.indexOf(row.node_id.replace('config:', ''));
        if (idx >= 0) this.lastConfigDeltas[idx] = row.value * deltaMax;
      }
    }

    // Layer 3: hormones → mode probabilities (graph traversal + softmax)
    await this.db.execute(
      'RETURN fn::nn_forward("affect", "hidden", "mode")',
    );
    const modeResult = await this.db.query<{ node_id: string; value: number }>(
      'RETURN fn::nn_softmax("affect", "mode")',
    );
    if (modeResult.isOk()) {
      for (const row of modeResult.value) {
        const idx = MODE_NAMES.indexOf(row.node_id.replace('mode:', ''));
        if (idx >= 0) this.lastModeProbs[idx] = row.value;
      }
    }
  }

  // ═══════════════════════════════════════════
  // LOSS & BACKWARD PASS
  // ═══════════════════════════════════════════

  private computeLoss(): number {
    return this.acc[0] + this.acc[2] - this.acc[3] - this.acc[4];
  }

  private async backward(loss: number): Promise<void> {
    const lossSign = loss > 0 ? 1.0 : -1.0;

    // Update W1 edges: accumulators → hormones
    await this.db.execute(
      'RETURN fn::nn_backward_layer("affect", "input", "hidden", $lr, $sign)',
      { lr: 0.01, sign: lossSign },
    );

    // Update W2 edges: hormones → config
    await this.db.execute(
      'RETURN fn::nn_backward_layer("affect", "hidden", "output", $lr, $sign)',
      { lr: 0.01, sign: lossSign },
    );

    // Update W_mode edges: hormones → modes
    // Mode target: defensive if high loss, explore if low loss, exploit otherwise
    const modeSign = loss > this.config.get('affect.mode_boundary_positive') ? 1.0
      : loss < this.config.get('affect.mode_boundary_negative') ? -1.0 : 0.0;
    if (modeSign !== 0) {
      await this.db.execute(
        'RETURN fn::nn_backward_layer("affect", "hidden", "mode", $lr, $sign)',
        { lr: 0.01, sign: modeSign },
      );
    }

    this.stepCount++;
  }

  // ═══════════════════════════════════════════
  // ACCUMULATOR UPDATE (pure JS arithmetic)
  // ═══════════════════════════════════════════

  private updateAccumulators(commits: CommitDelta[], timeSense: TimeSense): void {
    const decayRate = this.config.get('affect.accumulator_decay_rate');

    if (commits.length > 0) {
      const avgPredError = commits.reduce((s, c) => s + c.prediction_error, 0) / commits.length;
      const avgNovelty = commits.reduce((s, c) => s + c.novelty_cost, 0) / commits.length;
      const avgUrgency = commits.reduce((s, c) => s + c.urgency, 0) / commits.length;
      const convergent = commits.filter(c => c.convergence_score > 0.3).length;
      const escalations = commits.filter(c => c.is_escalation).length;

      const baseActivity = Math.min(1, commits.length * 0.15);

      this.acc[0] += avgPredError + avgUrgency * 0.3 + baseActivity * 0.2;
      this.acc[1] += escalations * 0.3 + baseActivity * 0.1;
      this.acc[3] += convergent * 0.2 + (1 - avgPredError) * baseActivity * 0.1;
      this.acc[5] += avgNovelty + baseActivity * 0.3;
      this.acc[6] += (1 - timeSense.novelty_rate) * 0.2;
    }

    if (timeSense.tempo > 0.3) {
      this.acc[0] += timeSense.tempo * 0.1;
      this.acc[5] += timeSense.novelty_rate * 0.1;
    }

    if (this.acc[2] > 0.1) {
      this.painCyclesUnresolved++;
    } else {
      this.painCyclesUnresolved = 0;
    }

    for (let i = 0; i < N_ACCUMULATORS; i++) {
      this.acc[i] *= (1 - decayRate);
      this.acc[i] = Math.max(0, Math.min(5, this.acc[i]));
    }
  }

  // ═══════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════

  getSnapshot(): AffectiveSnapshot {
    const hormones = this.deriveHormones();
    const modeNames: Array<AffectiveSnapshot['mode']> = ['explore', 'exploit', 'defensive', 'resting'];
    const modeIdx = this.lastModeProbs.indexOf(Math.max(...Array.from(this.lastModeProbs)));

    return {
      hormones,
      pain: {
        intensity: 1 / (1 + Math.exp(-Math.max(-10, Math.min(10, this.acc[2])))),
        source: this.lastPainSource,
        chronic: this.painCyclesUnresolved > 5,
        accumulator: Math.round(this.acc[2] * 1000) / 1000,
        cycles_unresolved: this.painCyclesUnresolved,
      },
      valence: Math.max(-1, Math.min(1,
        Math.round((hormones.dopamine + hormones.serotonin - hormones.cortisol - (1 / (1 + Math.exp(-this.acc[2])))) * 100) / 100)),
      arousal: Math.max(0, Math.min(1,
        Math.round((hormones.norepinephrine + hormones.cortisol) / 2 * 100) / 100)),
      mode: modeNames[modeIdx] || 'exploit',
      mode_probabilities: Array.from(this.lastModeProbs).map(p => Math.round(p * 1000) / 1000),
      loss: Math.round(this.lastLoss * 1000) / 1000,
    };
  }

  deriveHormones(): HormoneLevels {
    return {
      cortisol: Math.round(this.lastHormones[0] * 1000) / 1000,
      dopamine: Math.round(this.lastHormones[1] * 1000) / 1000,
      norepinephrine: Math.round(this.lastHormones[2] * 1000) / 1000,
      serotonin: Math.round(this.lastHormones[3] * 1000) / 1000,
    };
  }

  inflictPain(source: string, amount: number): void {
    this.acc[2] += amount;
    this.acc[0] += amount * 0.5;
    this.lastPainSource = source;
    this.painCyclesUnresolved = 0;
  }

  reward(amount: number): void {
    this.acc[4] += amount;
    this.acc[3] += amount * 0.3;
    this.acc[2] = Math.max(0, this.acc[2] - amount * 0.5);
  }
}
