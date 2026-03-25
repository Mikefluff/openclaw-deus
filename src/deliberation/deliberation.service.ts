import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import { EventsService } from '../events/events.service';
import { LlmClientService } from '../llm/llm-client.service';
import { LlmOperationType, LlmPriority } from '../llm/types/llm.types';
import { DissensusService } from '../policy/services/dissensus.service';
import { RipenessService } from '../policy/services/ripeness.service';
import { IntentNormalizerService } from '../policy/services/intent-normalizer.service';
import { Deliberation, DeliberationResult, DeliberationOption } from '../common/types/deliberation.types';
import { Intention } from '../common/types/intention.types';
import { Knowledge } from '../common/types/knowledge.types';

const SYSTEM_PROMPT = `You are the deliberation module of a cognitive agent called DEUS.
Given an intention to advance and the current context, generate 2-3 approaches.

For each approach:
- Describe what to do
- Estimate success probability (0-1)
- Identify risks and prerequisites
- Classify as minimal/standard/thorough

Then select the BEST approach and explain your reasoning. Consider:
- What does the operator expect?
- What has worked before in similar situations?
- What could go wrong?
- Is this the right time to act?`;

const DELIBERATE_TOOL = {
  name: 'deliberate',
  description: 'Generate and evaluate approaches for advancing an intention',
  input_schema: {
    type: 'object' as const,
    properties: {
      options: {
        type: 'array' as const, items: {
          type: 'object' as const, properties: {
            description: { type: 'string' as const },
            approach: { type: 'string' as const, enum: ['minimal', 'standard', 'thorough'] },
            estimated_success: { type: 'number' as const },
            estimated_cost: { type: 'string' as const, enum: ['low', 'medium', 'high'] },
            risks: { type: 'array' as const, items: { type: 'string' as const } },
            prerequisites: { type: 'array' as const, items: { type: 'string' as const } },
          },
          required: ['description', 'approach', 'estimated_success', 'risks'],
        },
      },
      selected: { type: 'number' as const, description: 'Index of selected option (0-based)' },
      reasoning: { type: 'string' as const },
    },
    required: ['options', 'selected', 'reasoning'],
  },
};

@Injectable()
export class DeliberationService {
  private readonly logger = new Logger(DeliberationService.name);

  constructor(
    private readonly db: SurrealService,
    private readonly events: EventsService,
    private readonly llm: LlmClientService,
    private readonly dissensus: DissensusService,
    private readonly ripeness: RipenessService,
    private readonly normalizer: IntentNormalizerService,
  ) {}

  async deliberate(intention: Intention, context?: { knowledge?: Knowledge[] }): Promise<Result<DeliberationResult, DomainError>> {
    const now = new Date().toISOString();

    let options: DeliberationOption[];
    let selectedOption: number;
    let reasoning: string;

    if (this.llm.isAvailable()) {
      // LLM deliberation
      const llmResult = await this.llm.call<{ options: DeliberationOption[]; selected: number; reasoning: string }>({
        operationType: LlmOperationType.DELIBERATION,
        priority: LlmPriority.HIGH,
        maxTokens: 1024,
        systemPrompt: SYSTEM_PROMPT,
        userMessage: this.buildUserMessage(intention, context?.knowledge || []),
        tools: [DELIBERATE_TOOL],
        forceTool: 'deliberate',
      });

      if (llmResult.isOk()) {
        options = llmResult.value.data.options;
        selectedOption = llmResult.value.data.selected;
        reasoning = llmResult.value.data.reasoning;
      } else {
        // Fallback: single default option
        return this.fallbackDeliberation(intention);
      }
    } else {
      return this.fallbackDeliberation(intention);
    }

    // Safety check on selected option
    const selected = options[selectedOption] || options[0];
    const intent = this.normalizer.normalize({
      action_type: 'write_internal',
      goal: intention.description,
      target: selected.description,
    });

    const dissensusResult = this.dissensus.evaluate(intent, null);
    const ripenessResult = this.ripeness.score(intent, null);

    const safetyPassed = dissensusResult.isOk() && dissensusResult.value.decision === 'allow';

    const deliberation: Deliberation = {
      intention_id: intention.intention_id,
      trigger: 'new_intention',
      options,
      selected_option: selectedOption,
      reasoning,
      commitment_level: safetyPassed ? 'committed' : 'tentative',
      safety_check: {
        dissensus: dissensusResult.isOk() ? dissensusResult.value : undefined as any,
        ripeness: ripenessResult,
        passed: safetyPassed,
      },
      outcome: 'pending',
      created_at: now,
    };

    // Persist
    await this.db.create('deliberation', deliberation as any);
    await this.events.emit('deliberation.decided' as any, {
      intention_id: intention.intention_id,
      selected: selected.description,
      safety_passed: safetyPassed,
    });

    this.logger.log(`Deliberation for ${intention.intention_id}: selected "${selected.description}" (safety: ${safetyPassed})`);

    return ok({
      deliberation,
      action_to_take: selected.description,
      safety_passed: safetyPassed,
    });
  }

  private fallbackDeliberation(intention: Intention): Result<DeliberationResult, DomainError> {
    const now = new Date().toISOString();
    const option: DeliberationOption = {
      description: `Execute: ${intention.description}`,
      approach: 'standard',
      estimated_success: 0.7,
      estimated_cost: 'medium',
      risks: ['No LLM available for nuanced planning'],
      prerequisites: [],
    };

    const deliberation: Deliberation = {
      intention_id: intention.intention_id,
      trigger: 'new_intention',
      options: [option],
      selected_option: 0,
      reasoning: 'Single option — LLM unavailable for deliberation',
      commitment_level: 'tentative',
      outcome: 'pending',
      created_at: now,
    };

    return ok({ deliberation, action_to_take: option.description, safety_passed: true });
  }

  private buildUserMessage(intention: Intention, knowledge: Knowledge[]): string {
    const knowledgeContext = knowledge.length > 0
      ? `\n\nRelevant knowledge:\n${knowledge.slice(0, 15).map((k) => `- [${k.knowledge_id}] ${k.content}`).join('\n')}`
      : '';

    return `Intention to advance:\n"${intention.description}"\n\nKind: ${intention.kind}\nSuccess criteria: ${intention.success_criteria}\nCurrent progress: ${intention.progress.estimated_completion * 100}%\nBlockers: ${intention.progress.blockers.join(', ') || 'none'}${knowledgeContext}`;
  }
}
