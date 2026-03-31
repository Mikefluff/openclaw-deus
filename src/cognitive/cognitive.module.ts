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
import { GraphLinkingService } from './graph-linking.service';
import { MetaLearningService } from './meta-learning.service';
import { TemporalCognitionService } from './temporal-cognition.service';
import { IntentionModule } from '../intention/intention.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { DeliberationModule } from '../deliberation/deliberation.module';
import { ExperienceModule } from '../experience/experience.module';
import { OperatorModelModule } from '../operator-model/operator-model.module';
import { MemoryModule } from '../memory/memory.module';
import { WorldModelModule } from '../world-model/world-model.module';
import { BeliefsModule } from '../beliefs/beliefs.module';
import { KernelModule } from '../kernel/kernel.module';

@Global()
@Module({
  // No imports: CognitiveConfigService extracted to CognitiveConfigModule (@Global).
  // All data access via SurrealService. IntentionModule + KnowledgeModule are @Global.
  imports: [],
  controllers: [CognitiveConfigController, CognitivePipelineController],
  providers: [
    // CognitiveConfigService moved to CognitiveConfigModule (@Global)
    SimilarityProvider,
    BayesianUpdaterService,
    CausalGraphService,
    CalibrationService,
    ImportanceScorerService,
    CognitivePipelineService,
    GraphLinkingService,
    MetaLearningService,
    TemporalCognitionService,
  ],
  exports: [
    SimilarityProvider,
    BayesianUpdaterService,
    CausalGraphService,
    CalibrationService,
    ImportanceScorerService,
    CognitivePipelineService,
    GraphLinkingService,
    MetaLearningService,
    TemporalCognitionService,
  ],
})
export class CognitiveModule {}
