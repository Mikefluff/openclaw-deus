import { Module } from '@nestjs/common';
import { TraceGraphService } from './memory/trace-graph.service';
import { CommitKernelService } from './commit/commit-kernel.service';
import { KernelLoopService } from './kernel-loop.service';
import { SensoryAgent } from './agents/sensory.agent';
import { PredictiveAgent } from './agents/predictive.agent';
import { AffectiveAgent } from './agents/affective.agent';
import { PriorityAgent } from './agents/priority.agent';
import { StrategicAgent } from './agents/strategic.agent';
import { AffectiveStateService } from './affect/affective-state.service';
import { NarrativeService } from './narrative/narrative.service';
import { SubstrateBridgeService } from './substrate-bridge.service';
import { ActiveCognitionService } from './cognition/active-cognition.service';
import { ConceptSpaceService } from './space/concept-space.service';
import { FingerprinterService } from './sensory/fingerprinter.service';
import { ModalityDiscoveryService } from './sensory/modality-discovery.service';
import { RawStreamService } from './sensory/raw-stream.service';
import { AttentionService } from './sensory/attention.service';
import { EnergyService } from './energy.service';
import { LightConeService } from './light-cone.service';
import { DevelopmentalMetricsService } from './developmental-metrics.service';
import { SensorimotorPredictorService } from './sensorimotor-predictor.service';
import { CognitiveConeService } from './cognitive-cone.service';

@Module({
  imports: [
    // Explicit imports to work around NestJS 11 @Global resolution bug
    require('../database/database.module').DatabaseModule,
    require('../cognitive/cognitive-config.module').CognitiveConfigModule,
  ],
  providers: [
    TraceGraphService,
    CommitKernelService,
    KernelLoopService,
    AffectiveStateService,
    NarrativeService,
    SubstrateBridgeService,
    ActiveCognitionService,
    ConceptSpaceService,
    FingerprinterService,
    ModalityDiscoveryService,
    RawStreamService,
    AttentionService,
    EnergyService,
    LightConeService,
    DevelopmentalMetricsService,
    SensorimotorPredictorService,
    CognitiveConeService,
    SensoryAgent,
    PredictiveAgent,
    AffectiveAgent,
    PriorityAgent,
    StrategicAgent,
  ],
  exports: [
    KernelLoopService,
    TraceGraphService,
    CommitKernelService,
    AffectiveStateService,
    ConceptSpaceService,
    DevelopmentalMetricsService,
    CognitiveConeService,
    EnergyService,
    NarrativeService,
    SensorimotorPredictorService,
    RawStreamService,
    ModalityDiscoveryService,
    LightConeService,
  ],
})
export class KernelModule {}
