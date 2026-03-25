import { Test, TestingModule } from '@nestjs/testing';
import { WorldModelService } from './world-model.service';
import { BeliefsService } from '../beliefs/beliefs.service';
import { MemoryService } from '../memory/memory.service';
import { SurrealService } from '../database/surreal.service';
import { ok } from 'neverthrow';
import { Belief } from '../common/types/belief.types';

function makeBelief(id: string, overrides: Partial<Belief> = {}): Belief {
  return {
    id: `belief:${id}`, belief_id: id, content: `Belief ${id}`, confidence: 0.9,
    evidence_set: [], source_type: 'inference', belief_class: 'operational',
    decay_mode: 'normal', confidence_floor: 0.5, review_threshold: 0.7,
    context_scope: 'test', status: 'active', drift_history: [],
    timestamp_created: '2026-01-01T00:00:00Z', timestamp_updated: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('WorldModelService', () => {
  let service: WorldModelService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorldModelService,
        {
          provide: BeliefsService,
          useValue: {
            findAll: jest.fn().mockResolvedValue(ok([
              makeBelief('I1', { belief_class: 'axiom', confidence: 1.0 }),
              makeBelief('B1'),
              makeBelief('B2', { belief_class: 'user_model', content: 'User prefers TS' }),
            ])),
          },
        },
        {
          provide: MemoryService,
          useValue: {
            getRecentEntries: jest.fn().mockResolvedValue(ok([
              { day_key: '2026-03-25', type: 'event', description: 'test' },
            ])),
          },
        },
        {
          provide: SurrealService,
          useValue: {
            query: jest.fn().mockResolvedValue(ok([{ count: 0 }])),
            create: jest.fn().mockResolvedValue(ok({})),
          },
        },
      ],
    }).compile();

    service = module.get(WorldModelService);
  });

  describe('build', () => {
    it('should build a complete world model', async () => {
      const result = await service.build();
      expect(result.isOk()).toBe(true);
      const wm = result._unsafeUnwrap();
      expect(wm.version).toBe(1);
      expect(wm.confidence).toBeGreaterThan(0);
      expect(wm.self_model.invariants).toHaveLength(1);
      expect(wm.human_model.preferences).toContain('User prefers TS');
      expect(wm.sources.beliefs.count).toBe(3);
    });

    it('should set workspace_day', async () => {
      const result = await service.build(new Date('2026-03-25'));
      expect(result._unsafeUnwrap().workspace_day).toBe('2026-03-25');
    });
  });

  describe('isFresh', () => {
    it('should be fresh when recently generated', () => {
      const model = { generated_at: new Date().toISOString() } as any;
      expect(service.isFresh(model)).toBe(true);
    });

    it('should be stale after 6 hours', () => {
      const oldDate = new Date(Date.now() - 7 * 3600000).toISOString();
      const model = { generated_at: oldDate } as any;
      expect(service.isFresh(model)).toBe(false);
    });
  });
});
