import { Test, TestingModule } from '@nestjs/testing';
import { SurrealService } from './surreal.service';

describe('SurrealService', () => {
  let service: SurrealService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SurrealService],
    }).compile();

    service = module.get<SurrealService>(SurrealService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should report not connected before init', () => {
    expect(service.isConnected()).toBe(false);
  });
});
