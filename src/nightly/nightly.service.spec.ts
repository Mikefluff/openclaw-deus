import { Test, TestingModule } from '@nestjs/testing';
import { NightlyService } from './nightly.service';
import { MemoryAggregationService } from '../memory/services/memory-aggregation.service';
import { IntrospectionService } from '../introspection/introspection.service';
import { BeliefDecayService } from '../beliefs/services/belief-decay.service';
import { BeliefPromotionService } from '../beliefs/services/belief-promotion.service';
import { SurrealService } from '../database/surreal.service';
import { ok, err } from 'neverthrow';
import { ValidationError } from '../common/types/result.types';

describe('NightlyService', () => {
  let service: NightlyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NightlyService,
        {
          provide: MemoryAggregationService,
          useValue: { aggregateDay: jest.fn().mockResolvedValue(ok({ day_key: '2026-03-25', entries_processed: 5, sections_updated: ['Git Activity'] })) },
        },
        {
          provide: IntrospectionService,
          useValue: { run: jest.fn().mockResolvedValue(ok({ posture: 'stable', coherence_score: 0.9 })) },
        },
        {
          provide: BeliefDecayService,
          useValue: { runDecayCycle: jest.fn().mockResolvedValue(ok({ decayed: 2, flagged: 0 })) },
        },
        {
          provide: BeliefPromotionService,
          useValue: { runPromotionReview: jest.fn().mockResolvedValue(ok({ promoted: 1, deferred: 0, rejected: 0 })) },
        },
        {
          provide: SurrealService,
          useValue: { create: jest.fn().mockResolvedValue(ok({})) },
        },
      ],
    }).compile();

    service = module.get(NightlyService);
  });

  it('should execute all 5 stages in order', async () => {
    const result = await service.run();
    expect(result.isOk()).toBe(true);
    const run = result._unsafeUnwrap();
    expect(run.stages).toHaveLength(5);
    expect(run.stage_order).toEqual(['memory_aggregate', 'sleep', 'introspect', 'decay_tune', 'belief_review']);
  });

  it('should report passed/failed in summary', async () => {
    const result = await service.run();
    const run = result._unsafeUnwrap();
    expect(run.summary).toEqual(expect.objectContaining({ total_stages: 5, passed: 5, failed: 0 }));
  });

  it('should continue even if one stage fails', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NightlyService,
        { provide: MemoryAggregationService, useValue: { aggregateDay: jest.fn().mockResolvedValue(err(new ValidationError('fail'))) } },
        { provide: IntrospectionService, useValue: { run: jest.fn().mockResolvedValue(ok({ posture: 'stable', coherence_score: 0.9 })) } },
        { provide: BeliefDecayService, useValue: { runDecayCycle: jest.fn().mockResolvedValue(ok({ decayed: 0 })) } },
        { provide: BeliefPromotionService, useValue: { runPromotionReview: jest.fn().mockResolvedValue(ok({ promoted: 0 })) } },
        { provide: SurrealService, useValue: { create: jest.fn().mockResolvedValue(ok({})) } },
      ],
    }).compile();

    const svc = module.get(NightlyService);
    const result = await svc.run();
    expect(result.isOk()).toBe(true);
    const run = result._unsafeUnwrap();
    expect(run.stages[0].status).toBe('error');
    expect(run.stages.length).toBe(5); // all stages ran
  });

  it('should set timestamps', async () => {
    const result = await service.run();
    const run = result._unsafeUnwrap();
    expect(run.started_at).toBeDefined();
    expect(run.finished_at).toBeDefined();
    expect(new Date(run.finished_at).getTime()).toBeGreaterThanOrEqual(new Date(run.started_at).getTime());
  });
});
