import { Test, TestingModule } from '@nestjs/testing';
import { EpisodeService } from './episode.service';
import { SurrealService } from '../database/surreal.service';
import { EventsService } from '../events/events.service';
import { LlmClientService } from '../llm/llm-client.service';
import { GraphLinkingService } from '../cognitive/graph-linking.service';
import { mockEventsService } from '../__mocks__/events.mock';
import { ok } from 'neverthrow';

describe('EpisodeService', () => {
  let service: EpisodeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EpisodeService,
        { provide: SurrealService, useValue: {
          create: jest.fn().mockResolvedValue(ok({ id: 'episode:test', episode_id: 'EP001' })),
          query: jest.fn().mockResolvedValue(ok([])),
          execute: jest.fn().mockResolvedValue(ok(undefined)),
        }},
        { provide: EventsService, useValue: mockEventsService },
        { provide: LlmClientService, useValue: { isAvailable: jest.fn().mockReturnValue(false) }},
        { provide: GraphLinkingService, useValue: {
          linkEpisodeToIntention: jest.fn().mockResolvedValue(ok(undefined)),
        }},
      ],
    }).compile();

    service = module.get(EpisodeService);
  });

  describe('createFromCompletion (fallback)', () => {
    it('should create basic episode when LLM unavailable', async () => {
      const result = await service.createFromCompletion('INT001', 'Fixed the login bug', 'success');
      expect(result.isOk()).toBe(true);
    });
  });

  describe('getSuccessRate', () => {
    it('should return 0.5 when no episodes', async () => {
      const result = await service.getSuccessRate();
      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(0.5);
    });
  });
});
