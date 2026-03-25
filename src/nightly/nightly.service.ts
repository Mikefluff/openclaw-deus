import { Injectable, Logger } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import { NightlyRunResult, NightlyStageResult } from '../common/types/introspection.types';
import { MemoryAggregationService } from '../memory/services/memory-aggregation.service';
import { IntrospectionService } from '../introspection/introspection.service';
import { BeliefDecayService } from '../beliefs/services/belief-decay.service';
import { BeliefPromotionService } from '../beliefs/services/belief-promotion.service';

@Injectable()
export class NightlyService {
  private readonly logger = new Logger(NightlyService.name);

  constructor(
    private readonly aggregation: MemoryAggregationService,
    private readonly introspection: IntrospectionService,
    private readonly decay: BeliefDecayService,
    private readonly promotion: BeliefPromotionService,
    private readonly db: SurrealService,
  ) {}

  async run(now?: Date): Promise<Result<NightlyRunResult, DomainError>> {
    const startedAt = (now || new Date()).toISOString();
    const stages: NightlyStageResult[] = [];

    // Stage 1: Memory aggregation
    this.logger.log('Nightly: memory aggregate');
    const aggResult = await this.aggregation.aggregateDay();
    stages.push({
      name: 'memory_aggregate',
      status: aggResult.isOk() ? 'ok' : 'error',
      result: aggResult.isOk() ? (aggResult.value as any) : { error: aggResult.error.message },
    });

    // Stage 2: Sleep cycle (lightweight introspection)
    this.logger.log('Nightly: sleep cycle');
    const sleepResult = await this.introspection.run('sleep');
    stages.push({
      name: 'sleep',
      status: sleepResult.isOk() ? 'ok' : 'error',
      result: sleepResult.isOk() ? { posture: sleepResult.value.posture, coherence: sleepResult.value.coherence_score } : { error: sleepResult.error.message },
    });

    // Stage 3: Full introspection
    this.logger.log('Nightly: full introspection');
    const introResult = await this.introspection.run('full');
    stages.push({
      name: 'introspect',
      status: introResult.isOk() ? 'ok' : 'error',
      result: introResult.isOk() ? { posture: introResult.value.posture, coherence: introResult.value.coherence_score } : { error: introResult.error.message },
    });

    // Stage 4: Decay tuning
    this.logger.log('Nightly: decay cycle');
    const decayResult = await this.decay.runDecayCycle();
    stages.push({
      name: 'decay_tune',
      status: decayResult.isOk() ? 'ok' : 'error',
      result: decayResult.isOk() ? (decayResult.value as any) : { error: decayResult.error.message },
    });

    // Stage 5: Belief promotion review
    this.logger.log('Nightly: belief review');
    const reviewResult = await this.promotion.runPromotionReview();
    stages.push({
      name: 'belief_review',
      status: reviewResult.isOk() ? 'ok' : 'error',
      result: reviewResult.isOk() ? (reviewResult.value as any) : { error: reviewResult.error.message },
    });

    const finishedAt = new Date().toISOString();
    const nightlyResult: NightlyRunResult = {
      stages,
      stage_order: stages.map((s) => s.name),
      summary: {
        total_stages: stages.length,
        passed: stages.filter((s) => s.status === 'ok').length,
        failed: stages.filter((s) => s.status === 'error').length,
      },
      started_at: startedAt,
      finished_at: finishedAt,
    };

    // Persist
    await this.db.create('nightly_run', nightlyResult as any);

    this.logger.log(`Nightly complete: ${stages.filter((s) => s.status === 'ok').length}/${stages.length} stages passed`);
    return ok(nightlyResult);
  }
}
