import { Global, Module } from '@nestjs/common';
import { BayesianUpdaterService } from './bayesian-updater.service';
import { CausalGraphService } from './causal-graph.service';
import { CalibrationService } from './calibration.service';
import { ImportanceScorerService } from './importance-scorer.service';
import { CognitiveConfigService } from './cognitive-config.service';
import { SimilarityProvider } from './similarity.provider';
import { CognitiveConfigController } from './cognitive-config.controller';

@Global()
@Module({
  controllers: [CognitiveConfigController],
  providers: [
    CognitiveConfigService,
    SimilarityProvider,
    BayesianUpdaterService,
    CausalGraphService,
    CalibrationService,
    ImportanceScorerService,
  ],
  exports: [
    CognitiveConfigService,
    SimilarityProvider,
    BayesianUpdaterService,
    CausalGraphService,
    CalibrationService,
    ImportanceScorerService,
  ],
})
export class CognitiveModule {}
