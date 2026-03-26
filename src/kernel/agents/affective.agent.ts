import { Injectable, Logger } from '@nestjs/common';
import { Signal } from '../kernel.types';
import { CognitiveAgent, AgentContext } from '../kernel-loop.service';
import { ImportanceScorerService } from '../../cognitive/importance-scorer.service';
import { AffectiveStateService } from '../affect/affective-state.service';
import { ActivityLogEntry } from '../../common/types/memory.types';

/**
 * AffectiveAgent (rank 3): "How does this FEEL? What matters?"
 *
 * NOT keyword matching. Reads real hormonal state from AffectiveStateService.
 * Produces signals about emotional significance, threat/reward, and urgency.
 *
 * This agent's slow-path activation itself IS a signal:
 * when emotions are intense, processing is "expensive" → novelty_cost rises → time stretches.
 */
@Injectable()
export class AffectiveAgent implements CognitiveAgent {
  readonly id = 'affective';
  readonly rank = 3;
  private readonly logger = new Logger(AffectiveAgent.name);

  constructor(
    private readonly importance: ImportanceScorerService,
    private readonly affectiveState: AffectiveStateService,
  ) {}

  async process(input: string, context: AgentContext): Promise<Signal[]> {
    const signals: Signal[] = [];
    const affect = this.affectiveState.getSnapshot();
    const targets = context.active_traces.slice(0, 3).map(t => t.trace_id);

    // Importance scoring (substrate)
    const importanceScore = this.importance.score({
      type: context.is_reflection ? 'event' : 'interaction',
      description: input.slice(0, 200),
      context: {},
      agent: 'DEUS',
      day_key: '',
      timestamp: '',
    } as ActivityLogEntry);

    // Detect explicit pain/reward from input
    this.detectPainReward(input);

    // Core signal: current affective state
    signals.push({
      agent_id: this.id,
      agent_rank: this.rank,
      type: 'affect',
      content: `Affect: mode=${affect.mode}, valence=${affect.valence}, arousal=${affect.arousal}, pain=${affect.pain.intensity}`,
      payload: {
        importance: importanceScore.score,
        importance_factors: importanceScore.factors,
        charge: affect.valence,
        hormones: affect.hormones,
        pain: affect.pain,
        mode: affect.mode,
      },
      confidence: 0.8,
      // High arousal = expensive processing (time stretches)
      novelty_cost: affect.arousal * 0.4 + Math.abs(affect.valence) * 0.2,
      used_slow_path: false,
      targets,
      cycle: context.cycle,
    });

    // Pain signal — if pain is significant, escalate
    if (affect.pain.intensity > 0.4) {
      signals.push({
        agent_id: this.id,
        agent_rank: this.rank,
        type: 'affect',
        content: `PAIN: ${affect.pain.source} (intensity=${affect.pain.intensity.toFixed(2)}, ${affect.pain.chronic ? 'CHRONIC' : 'acute'})`,
        payload: { pain: affect.pain, charge: -affect.pain.intensity },
        confidence: affect.pain.intensity, // pain confidence = its intensity
        novelty_cost: affect.pain.chronic ? 0.1 : 0.5, // chronic pain stops being novel
        used_slow_path: false,
        targets,
        cycle: context.cycle,
      });
    }

    // Stress signal — defensive mode
    if (affect.hormones.cortisol > 0.5) {
      signals.push({
        agent_id: this.id,
        agent_rank: this.rank,
        type: 'affect',
        content: `STRESS: cortisol=${affect.hormones.cortisol.toFixed(2)} — narrowing focus, being cautious`,
        payload: { cortisol: affect.hormones.cortisol, mode: 'defensive' },
        confidence: 0.7,
        novelty_cost: 0.2,
        used_slow_path: false,
        targets,
        cycle: context.cycle,
      });
    }

    // Reward signal — exploration mode
    if (affect.hormones.dopamine > 0.5) {
      signals.push({
        agent_id: this.id,
        agent_rank: this.rank,
        type: 'affect',
        content: `REWARD: dopamine=${affect.hormones.dopamine.toFixed(2)} — exploring, learning faster`,
        payload: { dopamine: affect.hormones.dopamine, mode: 'explore' },
        confidence: 0.7,
        novelty_cost: 0.1,
        used_slow_path: false,
        targets,
        cycle: context.cycle,
      });
    }

    return signals;
  }

  /**
   * Detect explicit pain/reward signals from input text.
   * Injects into AffectiveStateService for hormonal processing.
   */
  private detectPainReward(input: string): void {
    const lower = input.toLowerCase();

    // Pain indicators
    const painSignals = ['ошибк', 'error', 'fail', 'bug', 'broken', 'wrong', 'блокер', 'block', 'не работает', 'crash', 'проблем'];
    for (const p of painSignals) {
      if (lower.includes(p)) {
        this.affectiveState.inflictPain(`external: ${p}`, 0.3);
        break;
      }
    }

    // Reward indicators
    const rewardSignals = ['готово', 'done', 'success', 'работает', 'works', 'отлично', 'resolved', 'fixed', 'шикарно', 'perfect'];
    for (const r of rewardSignals) {
      if (lower.includes(r)) {
        this.affectiveState.reward(0.3);
        break;
      }
    }

    // Operator frustration = pain
    const frustrationSignals = ['wtf', 'ffs', 'нет не то', 'ты не понял', 'опять', 'блять', 'хуйня', 'нахуй'];
    for (const f of frustrationSignals) {
      if (lower.includes(f)) {
        this.affectiveState.inflictPain('operator_frustration', 0.5);
        break;
      }
    }
  }
}
