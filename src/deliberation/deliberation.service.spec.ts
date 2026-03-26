import { Test, TestingModule } from '@nestjs/testing';
import { DeliberationService } from './deliberation.service';
import { SurrealService } from '../database/surreal.service';
import { EventsService } from '../events/events.service';
import { LlmClientService } from '../llm/llm-client.service';
import { DissensusService } from '../policy/services/dissensus.service';
import { RipenessService } from '../policy/services/ripeness.service';
import { IntentNormalizerService } from '../policy/services/intent-normalizer.service';
import { EpisodeService } from '../experience/episode.service';
import { CausalGraphService } from '../cognitive/causal-graph.service';
import { mockEventsService } from '../__mocks__/events.mock';
import { ok } from 'neverthrow';
import { Intention } from '../common/types/intention.types';

const mockIntention: Intention = {
  intention_id: 'INT001',
  description: 'Write unit tests for auth module',
  kind: 'task',
  source: 'operator_explicit',
  status: 'active',
  children_ids: [],
  success_criteria: 'All auth tests pass',
  progress: { estimated_completion: 0, last_action: '', blockers: [] },
  recognized_at: new Date().toISOString(),
  relevant_knowledge_ids: [],
  priority: 0.8,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

describe('DeliberationService', () => {
  let service: DeliberationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeliberationService,
        IntentNormalizerService,
        { provide: SurrealService, useValue: { create: jest.fn().mockResolvedValue(ok({})) }},
        { provide: EventsService, useValue: mockEventsService },
        { provide: LlmClientService, useValue: { isAvailable: jest.fn().mockReturnValue(false) }},
        { provide: DissensusService, useValue: {
          evaluate: jest.fn().mockReturnValue(ok({ decision: 'allow', trigger_type: 'none', reason: 'safe' })),
        }},
        { provide: RipenessService, useValue: {
          score: jest.fn().mockReturnValue({ score: 0.8, class: 'ready', blockers: [], missing_preconditions: [], factor_scores: {}, rationale: '' }),
        }},
        { provide: EpisodeService, useValue: {
          findByIntention: jest.fn().mockResolvedValue(ok([])),
          findRecent: jest.fn().mockResolvedValue(ok([])),
        }},
        { provide: CausalGraphService, useValue: { build: jest.fn().mockResolvedValue({ isOk: () => true, isErr: () => false, value: { nodes: [], edges: [] } }), predictGoalSuccess: jest.fn().mockReturnValue({ success_probability: 0.5, blockers: [] }), getTopVOIBeliefs: jest.fn().mockReturnValue([]) } },
      ],
    }).compile();

    service = module.get(DeliberationService);
  });

  describe('deliberate (fallback mode)', () => {
    it('should produce a single fallback option when LLM unavailable', async () => {
      const result = await service.deliberate(mockIntention);
      expect(result.isOk()).toBe(true);
      const delib = result._unsafeUnwrap();
      expect(delib.deliberation.options).toHaveLength(1);
      expect(delib.deliberation.reasoning).toContain('LLM unavailable');
      expect(delib.safety_passed).toBe(true);
    });

    it('should include the intention description in action', async () => {
      const result = await service.deliberate(mockIntention);
      expect(result._unsafeUnwrap().action_to_take).toContain('Write unit tests');
    });
  });
});
