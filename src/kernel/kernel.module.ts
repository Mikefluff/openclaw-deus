import { Module } from '@nestjs/common';
import { KernelLoopService } from './kernel-loop.service';
import { TraceGraphService } from './memory/trace-graph.service';
import { DevelopmentalMetricsService } from './developmental-metrics.service';
import { DatabaseModule } from '../database/database.module';
import { CognitiveConfigModule } from '../cognitive/cognitive-config.module';

/**
 * KernelModule: minimal membrane over SurrealDB brain.
 *
 * KernelLoopService: heartbeat (setInterval → fn::kernel_tick) + health monitoring
 * TraceGraphService: thin DB wrapper for periphery operations (external event → trace)
 * DevelopmentalMetricsService: observes brain development (read-only)
 *
 * Everything else lives in SurrealDB stored procedures.
 */
@Module({
  imports: [DatabaseModule, CognitiveConfigModule],
  providers: [
    KernelLoopService,
    TraceGraphService,
    DevelopmentalMetricsService,
  ],
  exports: [
    KernelLoopService,
    TraceGraphService,
    DevelopmentalMetricsService,
  ],
})
export class KernelModule {}
