import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import { EventsService } from '../events/events.service';
import { IntentionRecognitionService } from '../intention/services/intention-recognition.service';
import { IntentionStackService } from '../intention/services/intention-stack.service';
import { IntentionService } from '../intention/intention.service';
import { KnowledgeExtractionService } from '../knowledge/services/knowledge-extraction.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { KnowledgeGapService } from '../knowledge/services/knowledge-gap.service';
import { DeliberationService } from '../deliberation/deliberation.service';
import { EpisodeService } from '../experience/episode.service';
import { SelfAssessmentService } from '../experience/self-assessment.service';
import { SessionTrackerService } from '../operator-model/services/session-tracker.service';
import { MemoryService } from '../memory/memory.service';

/**
 * CognitivePipelineService: THE BRAIN's MAIN LOOP.
 *
 * This is the orchestrator that ties all cognitive components together.
 * When an operator message arrives: intention → knowledge → deliberation → episode.
 *
 * Two pipelines:
 * 1. processMessage() — triggered on every substantive operator message
 * 2. onIntentionCompleted() — triggered when an intention reaches terminal state
 */
@Injectable()
export class CognitivePipelineService {
  private readonly logger = new Logger(CognitivePipelineService.name);

  constructor(
    private readonly db: SurrealService,
    private readonly events: EventsService,
    private readonly intentionRecognition: IntentionRecognitionService,
    private readonly intentionStack: IntentionStackService,
    private readonly intentions: IntentionService,
    private readonly knowledgeExtraction: KnowledgeExtractionService,
    private readonly knowledge: KnowledgeService,
    private readonly gaps: KnowledgeGapService,
    private readonly deliberation: DeliberationService,
    private readonly episodes: EpisodeService,
    private readonly selfAssessment: SelfAssessmentService,
    private readonly sessionTracker: SessionTrackerService,
    private readonly memory: MemoryService,
  ) {}

  /**
   * Process an operator message through the full cognitive pipeline.
   * Called on every substantive interaction.
   *
   * Pipeline:
   * [0] Track session (sync, no LLM)
   * [1a] Recognize intentions (LLM, CRITICAL priority) — parallel with 1b
   * [1b] Extract knowledge (LLM, HIGH priority) — parallel with 1a
   * [2] Deliberate on new intentions (LLM, HIGH priority)
   * [3] Link knowledge gaps to intentions
   * [4] Auto-adopt recognized intentions
   */
  async processMessage(message: string): Promise<Result<CognitivePipelineResult, DomainError>> {
    const startTime = Date.now();
    const result: CognitivePipelineResult = {
      intentions_recognized: 0,
      intentions_completed: 0,
      knowledge_extracted: 0,
      knowledge_gaps_found: 0,
      deliberations_made: 0,
      duration_ms: 0,
    };

    // Step 0: Session tracking (sync, fast, no LLM)
    await this.sessionTracker.trackMessage(message);
    await this.memory.logInteraction(message);

    // Step 1: Parallel — intention recognition + knowledge extraction
    const [intentionResult, knowledgeResult] = await Promise.all([
      this.intentionRecognition.recognizeFromMessage(message).catch((e) => {
        this.logger.warn(`Intention recognition failed: ${e}`);
        return ok({ new_intentions: [], updated_intentions: [], completed_intentions: [] }) as any;
      }),
      this.knowledgeExtraction.extractFromInteraction(message).catch((e) => {
        this.logger.warn(`Knowledge extraction failed: ${e}`);
        return ok({ new_knowledge: [], updated_knowledge: [], knowledge_gaps: [] }) as any;
      }),
    ]);

    // Process intention results
    if (intentionResult.isOk()) {
      const recognition = intentionResult.value;
      result.intentions_recognized = recognition.new_intentions.length;

      // Step 2: Deliberate on each new intention
      for (const newInt of recognition.new_intentions) {
        // Find the just-created intention
        const active = await this.intentions.findActive();
        if (active.isErr()) continue;

        const intention = active.value.find((i: any) =>
          i.description === newInt.description && i.status === 'recognized',
        );

        if (intention) {
          // Fetch relevant knowledge for context
          const relevantKnowledge = await this.knowledge.findSimilar(intention.description, 0.5);
          const knowledgeContext = relevantKnowledge.isOk() ? relevantKnowledge.value : [];

          const deliberationResult = await this.deliberation.deliberate(intention, { knowledge: knowledgeContext as any });
          if (deliberationResult.isOk()) {
            result.deliberations_made++;

            // Create graph: intention -> requires -> knowledge
            for (const k of knowledgeContext) {
              await this.db.relate(
                `(SELECT id FROM intention WHERE intention_id = '${intention.intention_id}' LIMIT 1)`,
                'requires',
                `(SELECT id FROM knowledge WHERE knowledge_id = '${(k as any).knowledge_id}' LIMIT 1)`,
              );
            }
          }
        }
      }

      // Process completed intentions
      for (const completed of recognition.completed_intentions) {
        result.intentions_completed++;
        await this.onIntentionCompleted(completed.intention_id, completed.outcome as any, completed.reasoning);
      }
    }

    // Process knowledge results
    if (knowledgeResult.isOk()) {
      const extraction = knowledgeResult.value;
      result.knowledge_extracted = extraction.new_knowledge.length;
      result.knowledge_gaps_found = extraction.knowledge_gaps.length;

      // Step 3: Link knowledge gaps to blocking intentions
      for (const gap of extraction.knowledge_gaps) {
        const openGaps = await this.gaps.findOpen();
        if (openGaps.isErr()) continue;

        const matchingGap = openGaps.value.find((g: any) => g.description === gap.description);
        if (matchingGap) {
          const activeIntentions = await this.intentions.findActive();
          if (activeIntentions.isOk()) {
            for (const intention of activeIntentions.value) {
              // Link if domains overlap
              if (this.domainOverlap(intention.description, gap.domain)) {
                await this.db.relate(
                  `(SELECT id FROM intention WHERE intention_id = '${intention.intention_id}' LIMIT 1)`,
                  'blocked_by',
                  `(SELECT id FROM knowledge_gap WHERE description = '${gap.description.replace(/'/g, "\\'")}' LIMIT 1)`,
                );
              }
            }
          }
        }
      }
    }

    // Step 4: Auto-adopt recognized intentions
    await this.intentionStack.autoAdopt();

    result.duration_ms = Date.now() - startTime;
    this.logger.log(
      `Pipeline: ${result.intentions_recognized} intents, ${result.knowledge_extracted} knowledge, ` +
      `${result.deliberations_made} deliberations, ${result.duration_ms}ms`,
    );

    return ok(result);
  }

  /**
   * Handle intention completion: create episode, extract knowledge, check parent.
   */
  async onIntentionCompleted(intentionId: string, outcome: 'completed' | 'failed' | 'abandoned', reason: string): Promise<void> {
    this.logger.log(`Intention ${intentionId} completed: ${outcome}`);

    // Step 1: Create episode
    const episodeOutcome = outcome === 'completed' ? 'success' as const
      : outcome === 'failed' ? 'failure' as const
      : 'abandoned' as const;
    const episodeResult = await this.episodes.createFromCompletion(intentionId, reason, episodeOutcome);

    if (episodeResult.isOk()) {
      const episode = episodeResult.value;

      // Step 2: Extract knowledge from episode lessons
      for (const lesson of episode.lessons || []) {
        const knowledgeKind = lesson.kind === 'factual' ? 'fact' as const
          : lesson.kind === 'procedural' ? 'procedural' as const
          : 'meta' as const;

        const kResult = await this.knowledge.create({
          kind: knowledgeKind,
          content: lesson.content,
          domain: 'general',
          confidence: lesson.confidence,
          evidence: [{
            source: episode.episode_id,
            quality: 'strong_implication',
            timestamp: new Date().toISOString(),
            content: `Lesson from episode ${episode.episode_id}`,
          }],
        });

        // Create graph: knowledge -> derived_from_episode -> episode
        if (kResult.isOk()) {
          await this.db.execute(
            `RELATE (SELECT id FROM knowledge WHERE knowledge_id = $kid LIMIT 1) -> derived_from_episode -> (SELECT id FROM episode WHERE episode_id = $eid LIMIT 1)`,
            { kid: (kResult.value as any).knowledge_id, eid: episode.episode_id },
          );
        }
      }
    }

    // Step 3: Check if parent intention is now complete
    await this.intentionStack.checkParentCompletion(intentionId);

    // Step 4: Self-assessment update (lightweight)
    await this.selfAssessment.updateFromEpisodes();
  }

  private domainOverlap(text: string, domain: string): boolean {
    return text.toLowerCase().includes(domain.toLowerCase());
  }
}

export interface CognitivePipelineResult {
  intentions_recognized: number;
  intentions_completed: number;
  knowledge_extracted: number;
  knowledge_gaps_found: number;
  deliberations_made: number;
  duration_ms: number;
}
