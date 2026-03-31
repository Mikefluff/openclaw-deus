import { Global, Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { DiagnosisService } from './diagnosis.service';
import { BenchmarkService } from './benchmark.service';
import { ExperimentService } from './experiment.service';
import { RecursiveImproveService } from './recursive-improve.service';
import { MetricsController } from './metrics.controller';

@Global()
@Module({
  // No imports: all data access via SurrealService (@Global). IntentionModule + KnowledgeModule + CognitiveConfigModule are @Global.
  imports: [],
  controllers: [MetricsController],
  providers: [
    MetricsService,
    DiagnosisService,
    BenchmarkService,
    ExperimentService,
    RecursiveImproveService,
  ],
  exports: [
    MetricsService,
    DiagnosisService,
    BenchmarkService,
    ExperimentService,
    RecursiveImproveService,
  ],
})
export class MetricsModule {}
