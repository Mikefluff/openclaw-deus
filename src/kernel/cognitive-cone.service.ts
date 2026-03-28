import { Injectable, Logger } from '@nestjs/common';

/**
 * CognitiveConeService: Determines processing depth and spread.
 *
 * NOT time-based. NOT tick-based. COGNITIVELY driven.
 *
 * Like physics: the light cone defines causal reach based on DISTANCE.
 * Like a camera: depth of field × aperture.
 * Like consciousness: attention expands when surprised, contracts when bored.
 *
 * DEPTH = how many graph hops to process
 *   1-hop: immediate neighbors (every event, minimal)
 *   2-hop: extended reach (activation accumulated)
 *   3-hop: deep chains (prediction error high)
 *   5-hop: full transitive closure (coherence dropped)
 *   10-hop: complete restructuring (post-sleep consolidation)
 *
 * SPREAD = how many traces to attend to
 *   3: narrow (default, energy conservation)
 *   10: medium (curiosity, accumulated change)
 *   20: wide (arousal spike, prediction error)
 *   50: full (structural reorganization)
 */

export interface CognitiveScope {
  depth: number;     // 1-N hops into graph
  spread: number;    // how many traces to process
  reason: string;    // what triggered this scope
}

export interface AffectSnapshot {
  hormones: { cortisol: number; dopamine: number; norepinephrine: number; serotonin: number };
  pain: { intensity: number };
  valence: number;
  arousal: number;
  mode: string;
}

export interface EnergyState {
  current: number;
  max: number;
  fatigue_level: number;
}

@Injectable()
export class CognitiveConeService {
  private readonly logger = new Logger(CognitiveConeService.name);

  // Accumulators — reset after processing at their scope
  private activationDelta = 0;
  private noveltyBurst = 0;
  private lastDimensionCount = 0;
  private justSlept = false;

  // History for logging
  private lastScope: CognitiveScope = { depth: 1, spread: 3, reason: 'init' };
  private scopeHistory: CognitiveScope[] = [];

  /**
   * Record a weight change (from trace activation).
   * Accumulated delta drives attention expansion.
   */
  recordActivation(delta: number): void {
    this.activationDelta += Math.abs(delta);
  }

  /**
   * Record new trace creation. Burst of new traces = novelty.
   */
  recordNewTrace(): void {
    this.noveltyBurst++;
  }

  /**
   * Record that sleep just happened — triggers deep consolidation.
   */
  recordSleep(): void {
    this.justSlept = true;
  }

  /**
   * Compute current cognitive scope from accumulated signals.
   *
   * This IS the attention mechanism. No ticks, no time.
   * Pure cognitive dynamics determine processing depth and width.
   */
  computeScope(affect: AffectSnapshot, energy: EnergyState, dimensionCount: number): CognitiveScope {
    let scope: CognitiveScope;

    // CONSOLIDATE: just woke up from sleep → full graph processing
    if (this.justSlept) {
      this.justSlept = false;
      scope = { depth: 10, spread: 50, reason: 'post_sleep_consolidation' };
    }
    // ENERGY CONSERVATION: low energy → minimal processing
    else if (energy.current < 0.2) {
      scope = { depth: 1, spread: 3, reason: 'energy_conservation' };
    }
    // RESTRUCTURE: new dimension born → structural reorganization
    else if (dimensionCount > this.lastDimensionCount) {
      this.lastDimensionCount = dimensionCount;
      scope = { depth: 5, spread: 50, reason: 'dimension_birth' };
    }
    // REFLECT: high prediction error or pain → deep processing
    else if (affect.hormones.cortisol > 0.6 || affect.pain.intensity > 0.3) {
      scope = { depth: 5, spread: 20, reason: 'prediction_error' };
    }
    // ATTEND: high arousal → wide attention
    else if (affect.hormones.norepinephrine > 0.6) {
      scope = { depth: 2, spread: 20, reason: 'arousal_spike' };
    }
    // ATTEND: novelty burst → medium attention
    else if (this.noveltyBurst > 3) {
      this.noveltyBurst = 0;
      scope = { depth: 3, spread: 10, reason: 'novelty_burst' };
    }
    // ATTEND: accumulated activation → extended reach
    else if (this.activationDelta > 0.5) {
      this.activationDelta = 0;
      scope = { depth: 2, spread: 10, reason: 'activation_accumulated' };
    }
    // LOCAL: nothing special → minimal processing
    else {
      scope = { depth: 1, spread: 3, reason: 'local' };
    }

    // Log scope changes
    if (scope.reason !== this.lastScope.reason) {
      this.logger.log(`Cognitive scope: ${scope.reason} (depth=${scope.depth}, spread=${scope.spread})`);
    }

    this.lastScope = scope;
    this.scopeHistory.push(scope);
    if (this.scopeHistory.length > 100) this.scopeHistory.shift();

    return scope;
  }

  /** Get last computed scope. */
  getLastScope(): CognitiveScope { return this.lastScope; }

  /** Get scope history for analysis. */
  getScopeHistory(): CognitiveScope[] { return [...this.scopeHistory]; }

  /** Reset accumulators (called after processing at the determined scope). */
  resetAccumulators(): void {
    // Only reset what was consumed by the current scope
    // activationDelta and noveltyBurst reset in computeScope when they trigger
    // This is intentional — unused accumulation carries forward
  }
}
