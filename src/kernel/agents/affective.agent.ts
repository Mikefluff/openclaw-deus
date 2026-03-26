import { Injectable, Logger } from '@nestjs/common';
import { Signal } from '../kernel.types';
import { CognitiveAgent, AgentContext } from '../kernel-loop.service';
import { ImportanceScorerService } from '../../cognitive/importance-scorer.service';
import { SessionTrackerService } from '../../operator-model/services/session-tracker.service';

/**
 * AffectiveAgent (rank 3): "How important is this? How does it feel?"
 *
 * Fast-path: importance scoring + frustration/load detection
 * Slow-path: LLM sentiment + operator emotional state inference
 *
 * Produces emotional_charge signals that modulate trace decay
 * (emotional traces decay slower — like real memory).
 */
@Injectable()
export class AffectiveAgent implements CognitiveAgent {
  readonly id = 'affective';
  readonly rank = 3;
  private readonly logger = new Logger(AffectiveAgent.name);

  constructor(
    private readonly importance: ImportanceScorerService,
    private readonly sessionTracker: SessionTrackerService,
  ) {}

  async process(input: string, context: AgentContext): Promise<Signal[]> {
    const signals: Signal[] = [];

    // Skip empty reflection
    if (context.is_reflection && input.includes('[nothing happened')) return signals;

    // FAST PATH: importance scoring
    const importanceScore = this.importance.score({
      type: context.is_reflection ? 'event' : 'interaction',
      description: input.slice(0, 200),
      context: {},
      agent: 'DEUS',
      day_key: '',
      timestamp: '',
    } as any);

    const charge = this.computeEmotionalCharge(input, importanceScore.score, context);

    signals.push({
      agent_id: this.id,
      agent_rank: this.rank,
      type: 'affect',
      content: `Importance=${importanceScore.score.toFixed(2)}, charge=${charge.toFixed(2)}`,
      payload: {
        importance: importanceScore.score,
        charge,
        factors: importanceScore.factors,
        is_threat: charge < -0.3,
        is_reward: charge > 0.3,
      },
      confidence: 0.7,
      novelty_cost: Math.abs(charge) > 0.5 ? 0.3 : 0.05, // strong emotion = costs attention
      used_slow_path: false,
      targets: context.active_traces.slice(0, 3).map(t => t.trace_id),
      cycle: context.cycle,
    });

    // Detect urgency from phenomenal state
    if (context.phenomenal_state) {
      if (context.phenomenal_state.felt_urgency > 0.7) {
        signals.push({
          agent_id: this.id,
          agent_rank: this.rank,
          type: 'affect',
          content: 'High urgency pressure — action needed',
          payload: { urgency: context.phenomenal_state.felt_urgency, charge: -0.4 },
          confidence: 0.9,
          novelty_cost: 0.1,
          used_slow_path: false,
          targets: [],
          cycle: context.cycle,
        });
      }
    }

    return signals;
  }

  /**
   * Emotional charge: -1 (threat) to +1 (reward).
   * Threat: errors, frustration, contradictions, stale knowledge.
   * Reward: successful episodes, new knowledge, operator satisfaction.
   */
  private computeEmotionalCharge(input: string, importance: number, context: AgentContext): number {
    let charge = 0;

    // Threat signals
    const threatWords = ['ошибк', 'error', 'fail', 'bug', 'broken', 'нет', 'wrong', 'блокер', 'block', 'urgent'];
    const lower = input.toLowerCase();
    for (const w of threatWords) {
      if (lower.includes(w)) { charge -= 0.15; break; }
    }

    // Reward signals
    const rewardWords = ['готово', 'done', 'success', 'работает', 'works', 'отлично', 'fix', 'resolved'];
    for (const w of rewardWords) {
      if (lower.includes(w)) { charge += 0.15; break; }
    }

    // High importance amplifies charge
    charge *= (0.5 + importance);

    // Prediction errors from previous cycle → negative charge
    if (context.recent_commits.some(c => c.prediction_error > 0.3)) {
      charge -= 0.2;
    }

    return Math.max(-1, Math.min(1, charge));
  }
}
