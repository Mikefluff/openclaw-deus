import { Injectable, Logger } from '@nestjs/common';
import { Signal } from '../kernel.types';
import { CognitiveAgent, AgentContext } from '../kernel-loop.service';
import { IntentionRecognitionService } from '../../intention/services/intention-recognition.service';
import { KnowledgeExtractionService } from '../../knowledge/services/knowledge-extraction.service';
import { KnowledgeService } from '../../knowledge/knowledge.service';

/**
 * SensoryAgent (rank 1): "What is happening?"
 *
 * Fast-path: pattern matching, keyword detection, embedding similarity
 * Slow-path: LLM intention recognition + knowledge extraction
 *
 * This is the cheapest, fastest agent. High false-alarm rate, low cost.
 * Fires on every input. Its job: detect entities, topics, novelty.
 */
@Injectable()
export class SensoryAgent implements CognitiveAgent {
  readonly id = 'sensory';
  readonly rank = 1;
  private readonly logger = new Logger(SensoryAgent.name);

  constructor(
    private readonly intentionRecognition: IntentionRecognitionService,
    private readonly knowledgeExtraction: KnowledgeExtractionService,
    private readonly knowledge: KnowledgeService,
  ) {}

  async process(input: string, context: AgentContext): Promise<Signal[]> {
    const signals: Signal[] = [];

    // Skip reflection inputs for sensory — we only sense external
    if (context.is_reflection) return signals;

    // FAST PATH: check if input relates to known knowledge (similarity)
    const novelty = await this.assessNovelty(input);
    const isNovel = novelty > 0.6;

    signals.push({
      agent_id: this.id,
      agent_rank: this.rank,
      type: 'perception',
      content: `Input detected: "${input.slice(0, 80)}..." (novelty=${novelty.toFixed(2)})`,
      payload: { raw_input: input.slice(0, 500), novelty, is_novel: isNovel },
      confidence: 0.8,
      novelty_cost: isNovel ? 0.3 : 0.05,
      used_slow_path: false,
      targets: [],
      cycle: context.cycle,
    });

    // SLOW PATH: if novel enough, do full LLM extraction
    if (isNovel || input.length > 100) {
      try {
        // Intention recognition (substrate service)
        const intentResult = await this.intentionRecognition.recognizeFromMessage(input);
        if (intentResult.isOk()) {
          const r = intentResult.value;
          for (const intent of r.new_intentions) {
            signals.push({
              agent_id: this.id,
              agent_rank: this.rank,
              type: 'perception',
              content: `Intention detected: "${intent.description}"`,
              payload: { intention: intent, kind: intent.kind, priority: intent.priority },
              confidence: 0.7,
              novelty_cost: 0.6,
              used_slow_path: true,
              targets: [],
              cycle: context.cycle,
            });
          }

          for (const completed of r.completed_intentions) {
            signals.push({
              agent_id: this.id,
              agent_rank: this.rank,
              type: 'perception',
              content: `Intention completed: ${completed.intention_id} (${completed.outcome})`,
              payload: { completed },
              confidence: 0.9,
              novelty_cost: 0.4,
              used_slow_path: true,
              targets: [],
              cycle: context.cycle,
            });
          }
        }

        // Knowledge extraction (substrate service)
        const knowResult = await this.knowledgeExtraction.extractFromInteraction(input);
        if (knowResult.isOk()) {
          const r = knowResult.value;
          for (const k of r.new_knowledge || []) {
            signals.push({
              agent_id: this.id,
              agent_rank: this.rank,
              type: 'perception',
              content: `Knowledge: "${k.content}"`,
              payload: { knowledge: k, domain: k.domain, kind: k.kind },
              confidence: k.confidence,
              novelty_cost: 0.5,
              used_slow_path: true,
              targets: [],
              cycle: context.cycle,
            });
          }
        }
      } catch (e) {
        this.logger.warn(`Slow-path extraction failed: ${e}`);
      }
    }

    return signals;
  }

  private async assessNovelty(input: string): Promise<number> {
    // Check similarity to existing knowledge — low similarity = high novelty
    const similar = await this.knowledge.findSimilar(input, 0.5);
    if (similar.isErr() || similar.value.length === 0) return 0.9; // nothing similar = very novel
    // More matches = less novel
    return Math.max(0.1, 1 - similar.value.length * 0.15);
  }
}
