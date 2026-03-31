import { Global, Module } from '@nestjs/common';
import { BayesianUpdaterService } from './bayesian-updater.service';
import { CausalGraphService } from './causal-graph.service';
import { CalibrationService } from './calibration.service';
import { ImportanceScorerService } from './importance-scorer.service';
import { SimilarityProvider } from './similarity.provider';
import { CognitiveConfigController } from './cognitive-config.controller';
import { CognitivePipelineService } from './cognitive-pipeline.service';
import { CognitivePipelineController } from './cognitive-pipeline.controller';
import { GraphLinkingService } from './graph-linking.service';
import { MetaLearningService } from './meta-learning.service';
import { TemporalCognitionService } from './temporal-cognition.service';

@Global()
@Module({
  imports: [],
  controllers: [CognitiveConfigController, CognitivePipelineController],
  providers: [
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
