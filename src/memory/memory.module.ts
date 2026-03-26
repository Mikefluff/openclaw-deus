import { Module } from '@nestjs/common';
import { MemoryService } from './memory.service';
import { MemoryController } from './memory.controller';
import { MemoryAggregationService } from './services/memory-aggregation.service';
import { ForgettingCurveService } from './services/forgetting-curve.service';

@Module({
  providers: [MemoryService, MemoryAggregationService, ForgettingCurveService],
  controllers: [MemoryController],
  exports: [MemoryService, MemoryAggregationService, ForgettingCurveService],
})
export class MemoryModule {}
