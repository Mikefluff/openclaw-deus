import { Global, Module } from '@nestjs/common';
import { BayesianUpdaterService } from './bayesian-updater.service';
import { CausalGraphService } from './causal-graph.service';
import { CalibrationService } from './calibration.service';
import { ImportanceScorerService } from './importance-scorer.service';
import { CognitiveConfigService } from './cognitive-config.service';
import { SimilarityProvider } from './similarity.provider';
import { CognitiveConfigController } from './cognitive-config.controller';
import { CognitivePipelineService } from './cognitive-pipeline.service';
import { CognitivePipelineController } from './cognitive-pipeline.controller';
import { IntentionModule } from '../intention/intention.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { DeliberationModule } from '../deliberation/deliberation.module';
import { ExperienceModule } from '../experience/experience.module';
import { OperatorModelModule } from '../operator-model/operator-model.module';
import { MemoryModule } from '../memory/memory.module';

@Global()
@Module({
  imports: [
    IntentionModule,
    KnowledgeModule,
    DeliberationModule,
    ExperienceModule,
    OperatorModelModule,
    MemoryModule,
  ],
  controllers: [CognitiveConfigController, CognitivePipelineController],
  providers: [
    CognitiveConfigService,
    SimilarityProvider,
    BayesianUpdaterService,
    CausalGraphService,
    CalibrationService,
    ImportanceScorerService,
    CognitivePipelineService,
  ],
  exports: [
    CognitiveConfigService,
    SimilarityProvider,
    BayesianUpdaterService,
    CausalGraphService,
    CalibrationService,
    ImportanceScorerService,
    CognitivePipelineService,
  ],
})
export class CognitiveModule {}
