import { Global, Module } from '@nestjs/common';
import { BayesianUpdaterService } from './bayesian-updater.service';
import { CausalGraphService } from './causal-graph.service';
import { CalibrationService } from './calibration.service';
import { ImportanceScorerService } from './importance-scorer.service';

@Global()
@Module({
  providers: [BayesianUpdaterService, CausalGraphService, CalibrationService, ImportanceScorerService],
  exports: [BayesianUpdaterService, CausalGraphService, CalibrationService, ImportanceScorerService],
})
export class CognitiveModule {}
