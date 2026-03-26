import { Injectable, Logger } from '@nestjs/common';
import { Signal } from '../kernel.types';
import { CognitiveAgent, AgentContext } from '../kernel-loop.service';
import { CausalGraphService } from '../../cognitive/causal-graph.service';
import { BayesianUpdaterService } from '../../cognitive/bayesian-updater.service';
import { CalibrationService } from '../../cognitive/calibration.service';

/**
 * PredictiveAgent (rank 2): "What will happen? Was I right?"
 *
 * Fast-path: Bayesian priors + causal graph traversal
 * Slow-path: LLM scenario planning
 *
 * Key role: generates prediction_error signals when expectations ≠ reality.
 * Prediction error is the CORE driver of time dilation.
 */
@Injectable()
export class PredictiveAgent implements CognitiveAgent {
  readonly id = 'predictive';
  readonly rank = 2;
  private readonly logger = new Logger(PredictiveAgent.name);

  // Track predictions to compute errors
  private lastPredictions = new Map<string, number>(); // trace_id → predicted confidence

  constructor(
    private readonly causalGraph: CausalGraphService,
    private readonly bayesian: BayesianUpdaterService,
    private readonly calibration: CalibrationService,
  ) {}

  async process(input: string, context: AgentContext): Promise<Signal[]> {
    const signals: Signal[] = [];

    // Check prediction errors from previous cycle's predictions
    for (const trace of context.active_traces) {
      const predicted = this.lastPredictions.get(trace.trace_id);
      if (predicted !== undefined) {
        const error = Math.abs(trace.weight - predicted);
        if (error > 0.15) {
          signals.push({
            agent_id: this.id,
            agent_rank: this.rank,
            type: 'prediction',
            content: `Prediction error: expected weight ${predicted.toFixed(2)} for "${trace.content.slice(0, 50)}", got ${trace.weight.toFixed(2)}`,
            payload: { prediction_error: error, trace_id: trace.trace_id, predicted, actual: trace.weight },
            confidence: 0.8,
            novelty_cost: error, // prediction error IS novelty cost
            used_slow_path: false,
            targets: [trace.trace_id],
            cycle: context.cycle,
          });
        }
      }
    }

    // FAST PATH: causal prediction for active traces
    try {
      const graph = await this.causalGraph.build();
      if (graph.isOk() && graph.value.nodes.length > 0) {
        const topVOI = this.causalGraph.getTopVOIBeliefs(graph.value, 3);
        for (const voi of topVOI) {
          if (voi.voi > 0.1) {
            signals.push({
              agent_id: this.id,
              agent_rank: this.rank,
              type: 'prediction',
              content: `High VOI: "${voi.label}" (value-of-information=${voi.voi.toFixed(2)}) — learning this would improve predictions`,
              payload: { voi: voi.voi, belief_id: voi.beliefId },
              confidence: 0.6,
              novelty_cost: 0.2,
              used_slow_path: false,
              targets: [],
              cycle: context.cycle,
            });
          }
        }
      }
    } catch { /* causal graph may not have data yet */ }

    // Update predictions for next cycle
    this.lastPredictions.clear();
    for (const trace of context.active_traces) {
      // Predict: trace weight will decay slightly (bayesian expectation)
      this.lastPredictions.set(trace.trace_id, trace.weight * 0.95);
    }

    return signals;
  }
}
