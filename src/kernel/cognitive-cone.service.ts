import { Injectable, Logger } from '@nestjs/common';
import { SurrealService } from '../database/surreal.service';

/**
 * CognitiveConeService: LEARNED attention policy via neural GRAPH.
 *
 * Architecture: 9 input nodes → 18 nn_edge weights → 2 output nodes
 * Forward pass = graph traversal (fn::nn_forward in SurrealDB/Rust)
 * Backward pass = edge weight update (fn::nn_backward in SurrealDB/Rust)
 *
 * No matrices. No JSON. Pure graph.
 *
 * Input nodes:  cone_in:{cortisol,dopamine,norepinephrine,serotonin,energy,fatigue,activation,novelty,pred_error}
 * Output nodes: cone_out:{depth,spread} (sigmoid activation)
 *
 * Loss = processing_cost - information_gain
 * Optimum: minimum processing for maximum learning.
 */

const DEPTH_MIN = 1;
const DEPTH_MAX = 10;
const SPREAD_MIN = 3;
const SPREAD_MAX = 50;

const CONE_INPUTS = ['cortisol', 'dopamine', 'norepinephrine', 'serotonin', 'energy', 'fatigue', 'activation', 'novelty', 'pred_error'];

export interface CognitiveScope {
  depth: number;
  spread: number;
  reason: string;
}

@Injectable()
export class CognitiveConeService {
  private readonly logger = new Logger(CognitiveConeService.name);

  // Input accumulators (fed from cognitive signals)
  private activationDelta = 0;
  private noveltyBurst = 0;
  private predErrorAcc = 0;
  private justSlept = false;

  // Cached outputs (for loss computation)
  private lastDepth = 1;
  private lastSpread = 3;
  private lastProcessingCost = 0;
  private stepCount = 0;

  // History
  private lastScope: CognitiveScope = { depth: 1, spread: 3, reason: 'init' };
  private scopeHistory: CognitiveScope[] = [];

  constructor(private readonly db: SurrealService) {}

  // ═══════════════════════════════════════════
  // SIGNAL ACCUMULATION
  // ═══════════════════════════════════════════

  recordActivation(delta: number): void { this.activationDelta += Math.abs(delta); }
  recordNewTrace(): void { this.noveltyBurst++; }
  recordPredictionError(error: number): void { this.predErrorAcc += error; }
  recordSleep(): void { this.justSlept = true; }

  // ═══════════════════════════════════════════
  // FORWARD PASS: graph traversal in SurrealDB
  // ═══════════════════════════════════════════

  async computeScope(
    affect: { hormones: { cortisol: number; dopamine: number; norepinephrine: number; serotonin: number }; pain: { intensity: number } },
    energy: { current: number; fatigue_level: number },
    dimensionCount: number,
  ): Promise<CognitiveScope> {
    // Post-sleep override (hard — consolidation must happen)
    if (this.justSlept) {
      this.justSlept = false;
      const scope = { depth: DEPTH_MAX, spread: SPREAD_MAX, reason: 'post_sleep_consolidation' };
      this.lastScope = scope;
      return scope;
    }

    // Build input values
    const inputValues = [
      affect.hormones.cortisol,
      affect.hormones.dopamine,
      affect.hormones.norepinephrine,
      affect.hormones.serotonin,
      energy.current,
      energy.fatigue_level ?? 0,
      Math.min(2, this.activationDelta),
      Math.min(5, this.noveltyBurst),
      Math.min(2, this.predErrorAcc),
    ];

    // Set input node values in graph
    const setParams = CONE_INPUTS.map((name, i) => ({
      node_id: `cone_in:${name}`,
      value: inputValues[i],
    }));

    await this.db.execute(
      'RETURN fn::nn_set_inputs($values)',
      { values: setParams },
    );

    // Forward pass = graph traversal (Rust)
    const result = await this.db.query<{ node_id: string; value: number }>(
      'RETURN fn::nn_forward("cone", "input", "output")',
    );

    // Parse output: cone_out:depth and cone_out:spread (sigmoid-activated → [0,1])
    let depthSig = 0.5;
    let spreadSig = 0.5;
    if (result.isOk()) {
      for (const row of result.value) {
        if (row.node_id === 'cone_out:depth') depthSig = row.value;
        if (row.node_id === 'cone_out:spread') spreadSig = row.value;
      }
    }

    // Scale sigmoid output to range
    const depth = Math.round(DEPTH_MIN + (DEPTH_MAX - DEPTH_MIN) * depthSig);
    const spread = Math.round(SPREAD_MIN + (SPREAD_MAX - SPREAD_MIN) * spreadSig);

    this.lastDepth = depth;
    this.lastSpread = spread;

    // Determine reason from dominant input
    let reason = 'learned';
    const maxInputIdx = inputValues.indexOf(Math.max(...inputValues));
    const reasons = ['cortisol', 'dopamine', 'norepinephrine', 'serotonin', 'energy', 'fatigue', 'activation', 'novelty', 'pred_error'];
    if (maxInputIdx >= 0) reason = reasons[maxInputIdx] || 'learned';

    // Energy conservation override (hard — can't process if no energy)
    const finalDepth = energy.current < 0.1 ? 1 : depth;
    const finalSpread = energy.current < 0.1 ? 3 : spread;

    const scope: CognitiveScope = { depth: finalDepth, spread: finalSpread, reason };

    if (scope.depth !== this.lastScope.depth || scope.spread !== this.lastScope.spread) {
      this.logger.log(`Attention: depth=${scope.depth} spread=${scope.spread} (${scope.reason})`);
    }

    this.lastScope = scope;
    this.scopeHistory.push(scope);
    if (this.scopeHistory.length > 100) this.scopeHistory.shift();

    // Track processing cost for loss computation
    this.lastProcessingCost = depth * spread * 0.001;

    // Reset accumulators consumed by this scope computation
    this.activationDelta *= 0.5;
    this.noveltyBurst = Math.max(0, this.noveltyBurst - 1);
    this.predErrorAcc *= 0.7;

    return scope;
  }

  // ═══════════════════════════════════════════
  // BACKWARD PASS: edge weight update in SurrealDB
  // ═══════════════════════════════════════════

  /**
   * Learn: did the chosen depth/spread lead to information gain?
   * Loss = processing_cost - information_gain
   * Backward pass = one SurrealDB query updating all 18 edges.
   */
  async learn(predictionErrorReduction: number): Promise<void> {
    const infoGain = Math.max(0, predictionErrorReduction);
    const cost = this.lastProcessingCost;
    const loss = cost - infoGain * 0.1;

    const lossSign = loss > 0 ? 1.0 : -1.0;

    // One query updates all 18 cone edges (Rust)
    await this.db.execute(
      'RETURN fn::nn_backward($model, $lr, $loss_sign)',
      { model: 'cone', lr: 0.005, loss_sign: lossSign },
    );

    this.stepCount++;
  }

  // ═══════════════════════════════════════════
  // WEIGHT LOADING (from graph — no JSON)
  // ═══════════════════════════════════════════

  async loadWeights(): Promise<void> {
    // Weights live in nn_edge — they're always loaded.
    // Just read step count from edge metadata.
    const result = await this.db.query<{ total: number }>(
      'SELECT math::sum(update_count) AS total FROM nn_edge WHERE in.model = "cone" GROUP ALL',
    );
    if (result.isOk() && result.value.length > 0) {
      this.stepCount = result.value[0].total || 0;
      this.logger.log(`Cone graph loaded: ${this.stepCount} total edge updates`);
    }
  }

  // ═══════════════════════════════════════════
  // PUBLIC API
  // ═══════════════════════════════════════════

  getLastScope(): CognitiveScope { return this.lastScope; }
  getScopeHistory(): CognitiveScope[] { return [...this.scopeHistory]; }
  getStepCount(): number { return this.stepCount; }
}
