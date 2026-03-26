import { Injectable, Logger } from '@nestjs/common';
import { Signal } from '../kernel.types';
import { CognitiveAgent, AgentContext } from '../kernel-loop.service';
import { IntentionStackService } from '../../intention/services/intention-stack.service';
import { IntentionService } from '../../intention/intention.service';
import { RipenessService } from '../../policy/services/ripeness.service';

/**
 * PriorityAgent (rank 4): "What should we do right now?"
 *
 * Fast-path: intention stack ordering + ripeness scoring
 * Slow-path: LLM prioritization with context
 *
 * Converts intentions into action signals when they're "ripe".
 */
@Injectable()
export class PriorityAgent implements CognitiveAgent {
  readonly id = 'priority';
  readonly rank = 4;
  private readonly logger = new Logger(PriorityAgent.name);

  constructor(
    private readonly intentionStack: IntentionStackService,
    private readonly intentions: IntentionService,
    private readonly ripeness: RipenessService,
  ) {}

  async process(input: string, context: AgentContext): Promise<Signal[]> {
    const signals: Signal[] = [];

    // FAST PATH: check intention stack for ripe intentions
    const activeResult = await this.intentions.findActive();
    if (activeResult.isErr()) return signals;

    const active = activeResult.value;
    if (active.length === 0) return signals;

    // Top priority intention
    const top = active[0];
    signals.push({
      agent_id: this.id,
      agent_rank: this.rank,
      type: 'priority',
      content: `Top priority: "${top.description}" (status=${top.status}, priority=${top.priority})`,
      payload: {
        intention_id: top.intention_id,
        priority: top.priority,
        status: top.status,
        active_count: active.length,
      },
      confidence: 0.7,
      novelty_cost: 0.1,
      used_slow_path: false,
      targets: [],
      cycle: context.cycle,
    });

    // Auto-adopt ripe intentions
    const adoptResult = await this.intentionStack.autoAdopt();
    if (adoptResult.isOk() && adoptResult.value > 0) {
      signals.push({
        agent_id: this.id,
        agent_rank: this.rank,
        type: 'priority',
        content: `Auto-adopted ${adoptResult.value} intentions`,
        payload: { adopted: adoptResult.value },
        confidence: 0.8,
        novelty_cost: 0.2,
        used_slow_path: false,
        targets: [],
        cycle: context.cycle,
      });
    }

    return signals;
  }
}
