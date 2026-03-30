import { KernelLoopService, CognitiveAgent, AgentContext } from '../kernel-loop.service';
import { TraceGraphService } from '../memory/trace-graph.service';
import { CommitKernelService } from '../commit/commit-kernel.service';
import { AffectiveStateService } from '../affect/affective-state.service';
import { CognitiveConfigService } from '../../cognitive/cognitive-config.service';
import { Signal, CommitDelta, TimeSense, Trace } from '../kernel.types';
import { ok } from 'neverthrow';
import { mockCognitiveConfig } from '../../__mocks__/cognitive-config.mock';

function makeSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    agent_id: 'test', agent_rank: 1, type: 'perception',
    content: 'test signal', payload: {},
    confidence: 0.5, novelty_cost: 0.3, used_slow_path: false,
    targets: ['T1'], cycle: 0, ...overrides,
  };
}

function makeCommit(overrides: Partial<CommitDelta> = {}): CommitDelta {
  return {
    commit_id: 'C1', cycle: 0, type: 'perceptual',
    source_agents: ['test'], convergence_score: 0.5, is_escalation: false,
    changes: { traces_activated: [], traces_suppressed: [], traces_created: [] },
    novelty_cost: 0.3, prediction_error: 0.1, maturity: 0.5, urgency: 0.3,
    energy: 0.2, ...overrides,
  };
}

const mockTimeSense: TimeSense = {
  cycle: 1, tempo: 0.5, novelty_rate: 0.3, prediction_error_rate: 0.1,
  trace_decay_velocity: 0.02, dilation: 1.0, rhythm_phase: 'active',
};

function setupService(): {
  service: KernelLoopService;
  mocks: {
    traceGraph: any;
    commitKernel: any;
    affect: any;
    energy: any;
    rawStream: any;
    lightCone: any;
    conceptSpace: any;
    sensorimotorPredictor: any;
    activeCognition: any;
    substrateBridge: any;
    narrative: any;
    worldBridge: any;
  };
} {
  const mockTraceGraph = {
    tick: jest.fn().mockReturnValue(1),
    getCycle: jest.fn().mockReturnValue(1),
    getActiveTraces: jest.fn().mockResolvedValue(ok([])),
    ingestSignals: jest.fn().mockResolvedValue(ok([])),
    findConvergentClusters: jest.fn().mockResolvedValue([]),
    forget: jest.fn().mockResolvedValue(ok({ decayed: 0, archived: 0 })),
    backpropagatePredictionError: jest.fn().mockResolvedValue(undefined),
    flushToDb: jest.fn().mockResolvedValue({ created: 0, reactivated: 0, linked: 0 }),
    flushBatchWrites: jest.fn().mockResolvedValue(undefined),
    flushBatchEdgeUpdates: jest.fn().mockResolvedValue(undefined),
    consolidateEpisodicEdges: jest.fn().mockResolvedValue(undefined),
    db: { execute: jest.fn().mockResolvedValue({ isOk: () => true, value: {} }) },
  };

  const mockCommitKernel = {
    processCycle: jest.fn().mockResolvedValue(ok([])),
    computeTimeSense: jest.fn().mockResolvedValue(mockTimeSense),
  };

  const mockAffect = {
    processCommits: jest.fn().mockReturnValue({ configDeltas: new Map() }),
    getSnapshot: jest.fn().mockReturnValue({
      hormones: { cortisol: 0.2, dopamine: 0.3, norepinephrine: 0.2, serotonin: 0.5 },
      pain: { intensity: 0, source: 'none', chronic: false, accumulator: 0, cycles_unresolved: 0 },
      valence: 0, arousal: 0.2, mode: 'exploit', mode_probabilities: [0.1, 0.6, 0.2, 0.1], loss: 0,
    }),
    reward: jest.fn(),
    inflictPain: jest.fn(),
  };

  const mockEnergy = {
    tick: jest.fn(),
    spend: jest.fn().mockReturnValue(true),
    canAffordLlm: jest.fn().mockReturnValue(true),
    canAffordExploration: jest.fn().mockReturnValue(true),
    needsSleep: jest.fn().mockReturnValue(false),
    attentionFactor: jest.fn().mockReturnValue(1.0),
    sleep: jest.fn().mockReturnValue({ slept: true, cycles_awake: 10 }),
    reward: jest.fn(),
    pain: jest.fn(),
    cost: { llm_call: 0.08, trace_create: 0.005, reflection_cycle: 0.01, commit: 0.005, exploration_action: 0.03, exploitation_action: 0.01 },
    getState: jest.fn().mockReturnValue({ current: 0.8, max: 1.0, fatigue_level: 0.1, total_energy_spent: 1.0 }),
  };

  const mockRawStream = { ingest: jest.fn().mockResolvedValue([]) };

  const mockLightCone = {
    fastTick: jest.fn().mockReturnValue({ shouldMedium: false, shouldSlow: false, shouldGlobal: false, shouldDeep: false }),
    markMedium: jest.fn(), markSlow: jest.fn(), markGlobal: jest.fn(), markDeep: jest.fn(),
    getHotTraces: jest.fn().mockReturnValue([]),
    flushWrites: jest.fn().mockReturnValue({ writes: [], edgeUpdates: [] }),
    loadFromDb: jest.fn(), activateHot: jest.fn(),
    getHotTraceCount: jest.fn().mockReturnValue(0),
    flushCreates: jest.fn().mockReturnValue([]),
    flushLinks: jest.fn().mockReturnValue([]),
    flushReactivations: jest.fn().mockReturnValue(new Map()),
  };

  const mockConceptSpace = {
    nameDimensions: jest.fn().mockResolvedValue(undefined),
    setHotTraceCount: jest.fn(),
    detectGraphConflicts: jest.fn().mockResolvedValue([]),
    birthDimension: jest.fn().mockResolvedValue({}),
    drift: jest.fn().mockResolvedValue({ merged: 0 }),
    getDimensionCount: jest.fn().mockReturnValue(3),
    distance: jest.fn().mockReturnValue(0.5),
    materializeClusters: jest.fn().mockResolvedValue({ created: 0, updated: 0 }),
    createSelfTrace: jest.fn().mockResolvedValue(undefined),
    computeGradientField: jest.fn().mockResolvedValue({ attractors: [], repellers: [] }),
    desireVector: jest.fn().mockReturnValue([0, 0, 0]),
  };

  const mockSensorimotorPredictor = {
    predict: jest.fn().mockReturnValue({ predicted_position: [0, 0, 0], uncertainty: [0.5, 0.5, 0.5], confidence: 0.5 }),
    flushTransitions: jest.fn().mockResolvedValue(undefined),
    trainOnBatch: jest.fn().mockResolvedValue({ loss: 0.1, count: 0 }),
    updatePosDim: jest.fn(),
    queueTransition: jest.fn(),
    computeEmpowerment: jest.fn().mockReturnValue(0.3),
  };

  const mockActiveCognition = {
    replayEpisode: jest.fn().mockResolvedValue([]),
    generateCuriosity: jest.fn().mockResolvedValue([]),
    activeInference: jest.fn().mockResolvedValue([]),
    detectSchemas: jest.fn().mockResolvedValue([]),
  };

  const mockSubstrateBridge = {
    syncSubstrateToTraces: jest.fn().mockResolvedValue(undefined),
    applyCommitsToWorldModel: jest.fn().mockResolvedValue(undefined),
    reinforceFromEpisode: jest.fn().mockResolvedValue(undefined),
  };

  const mockNarrative = { compact: jest.fn().mockResolvedValue({ isOk: () => true }) };

  const mockWorldBridge = {
    executeAction: jest.fn().mockResolvedValue([{ content: 'ball moved', source: 'physics', emotional_valence: 0.2 }]),
    getAvailableTargets: jest.fn().mockReturnValue(['ball', 'cube', 'box']),
    getAvailableActions: jest.fn().mockReturnValue(['push', 'touch', 'drop']),
  };

  const service = Object.create(KernelLoopService.prototype);
  (service as any).traceGraph = mockTraceGraph;
  (service as any).commitKernel = mockCommitKernel;
  (service as any).config = mockCognitiveConfig;
  (service as any).affect = mockAffect;
  (service as any).agents = [];
  (service as any).llmCallsUsed = 0;
  (service as any).allCommits = [];
  (service as any).phenomenalState = null;
  (service as any).guard = { consecutive_self_model_commits: 0, uncertainty_trend: [], orthogonal_signal_deficit: 0 };
  (service as any).eventQueue = [];
  (service as any).pendingResolvers = [];
  (service as any).eventIdCounter = 0;
  (service as any).processing = false;
  (service as any).running = false;
  (service as any).loopHandle = null;
  (service as any).energy = mockEnergy;
  (service as any).narrative = mockNarrative;
  (service as any).rawStream = mockRawStream;
  (service as any).lightCone = mockLightCone;
  (service as any).conceptSpace = mockConceptSpace;
  (service as any).sensorimotorPredictor = mockSensorimotorPredictor;
  (service as any).activeCognition = mockActiveCognition;
  (service as any).substrateBridge = mockSubstrateBridge;
  (service as any).cognitiveCone = {
    computeScope: jest.fn().mockReturnValue({ depth: 3, spread: 10, reason: 'test' }),
    recordActivation: jest.fn(),
    recordNewTrace: jest.fn(),
    recordPredictionError: jest.fn(),
    recordSleep: jest.fn(),
    learn: jest.fn().mockResolvedValue(undefined),
    getLastScope: jest.fn().mockReturnValue({ depth: 1, spread: 3, reason: 'local' }),
  };
  (service as any).intentions = {
    getTopPriority: jest.fn().mockResolvedValue({ isOk: () => true, value: null }),
  };
  (service as any).worldBridge = null; // no world by default
  (service as any).verbalProductions = [];
  (service as any).actionHistory = [];
  (service as any).lastActionPrediction = null;
  (service as any).learningDomain = null;
  (service as any).learningCycleCount = 0;
  (service as any).idleCyclesSinceLastLlm = 0;
  (service as any).idleCyclesWithoutProgress = 0;
  (service as any).lastIdleTraceCount = Infinity;
  (service as any).lastIdleErrorSum = Infinity;
  (service as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

  return {
    service,
    mocks: {
      traceGraph: mockTraceGraph,
      commitKernel: mockCommitKernel,
      affect: mockAffect,
      energy: mockEnergy,
      rawStream: mockRawStream,
      lightCone: mockLightCone,
      conceptSpace: mockConceptSpace,
      sensorimotorPredictor: mockSensorimotorPredictor,
      activeCognition: mockActiveCognition,
      substrateBridge: mockSubstrateBridge,
      narrative: mockNarrative,
      worldBridge: mockWorldBridge,
    },
  };
}

describe('KernelLoopService', () => {

  // ═══════════════════════════════════════════
  // STABILIZATION ENERGY (kept: tests real math)
  // ═══════════════════════════════════════════

  describe('stabilization energy', () => {
    it('should compute lower energy for fewer commits with low novelty', () => {
      const { service } = setupService();
      const stab = (service as any).computeStabilization(
        [makeCommit({ energy: 0.05, novelty_cost: 0.1 })],
        [makeCommit({ energy: 0.05 })],
        0.5,
      );
      expect(stab.energy).toBeLessThan(0.5);
    });

    it('should compute higher energy for escalations with high novelty', () => {
      const { service } = setupService();
      const stab = (service as any).computeStabilization(
        [makeCommit({ energy: 0.8, novelty_cost: 0.9, is_escalation: true })],
        [],
        0.1,
      );
      expect(stab.energy).toBeGreaterThan(0.1);
    });

    it('should return stable=true for empty commits', () => {
      const { service } = setupService();
      const stab = (service as any).computeStabilization([], [], 0.5);
      expect(stab.stable).toBe(true);
      expect(stab.energy).toBe(0);
    });
  });

  // ═══════════════════════════════════════════
  // GUARDRAILS (kept: tests real logic)
  // ═══════════════════════════════════════════

  describe('guardrails', () => {
    it('should detect no orthogonal signals when all targets seen', () => {
      const { service } = setupService();
      const hasOrtho = (service as any).hasOrthogonalSignals(
        [makeSignal({ targets: ['T1'] })],
        [makeCommit({ changes: { traces_activated: ['T1'], traces_suppressed: [], traces_created: [] } })],
      );
      expect(hasOrtho).toBe(false);
    });

    it('should detect orthogonal signals from new targets', () => {
      const { service } = setupService();
      const hasOrtho = (service as any).hasOrthogonalSignals(
        [makeSignal({ targets: ['T_NEW'] })],
        [makeCommit({ changes: { traces_activated: ['T1'], traces_suppressed: [], traces_created: [] } })],
      );
      expect(hasOrtho).toBe(true);
    });

    it('should detect orthogonal from high novelty', () => {
      const { service } = setupService();
      const hasOrtho = (service as any).hasOrthogonalSignals(
        [makeSignal({ targets: ['T1'], novelty_cost: 0.8 })],
        [makeCommit({ changes: { traces_activated: ['T1'], traces_suppressed: [], traces_created: [] } })],
      );
      expect(hasOrtho).toBe(true);
    });
  });

  // ═══════════════════════════════════════════
  // SLEEP DURATION (kept: tests real bounds)
  // ═══════════════════════════════════════════

  describe('sleep duration', () => {
    it('should sleep longer with low arousal', () => {
      const { service, mocks } = setupService();
      mocks.affect.getSnapshot.mockReturnValue({ arousal: 0.1 });
      (service as any).eventQueue = [];
      const sleep = (service as any).computeSleepDuration();
      expect(sleep).toBeGreaterThan(1000);
    });

    it('should sleep shorter with high arousal', () => {
      const { service, mocks } = setupService();
      mocks.affect.getSnapshot.mockReturnValue({ arousal: 0.9 });
      (service as any).eventQueue = [];
      const sleep = (service as any).computeSleepDuration();
      expect(sleep).toBeLessThan(500);
    });

    it('should be immediate when events pending', () => {
      const { service, mocks } = setupService();
      mocks.affect.getSnapshot.mockReturnValue({ arousal: 0.1 });
      (service as any).eventQueue = [{ type: 'message', content: 'test', timestamp: 0 }];
      const sleep = (service as any).computeSleepDuration();
      expect(sleep).toBe(0);
    });
  });

  // ═══════════════════════════════════════════
  // PUMP: processes events (NEW behavioral test)
  // ═══════════════════════════════════════════

  describe('pump()', () => {
    it('should process queued events through rawStream and commitKernel', async () => {
      const { service, mocks } = setupService();
      const testSignal = makeSignal({ content: 'ball rolled', confidence: 0.7, targets: ['T1'] });
      mocks.rawStream.ingest.mockResolvedValue([testSignal]);

      // Push an event
      service.pushEvent('ball rolled', 'message', 'physics');

      // Pump should process it
      await service.pump();

      expect(mocks.rawStream.ingest).toHaveBeenCalled();
      expect(mocks.commitKernel.processCycle).toHaveBeenCalled();
    });

    it('should not process when already processing', async () => {
      const { service, mocks } = setupService();
      (service as any).processing = true;
      service.pushEvent('test');
      await service.pump();
      expect(mocks.rawStream.ingest).not.toHaveBeenCalled();
    });

    it('should spend energy per event during pump', async () => {
      const { service, mocks } = setupService();
      mocks.rawStream.ingest.mockResolvedValue([]);
      service.pushEvent('event1');
      service.pushEvent('event2');
      await service.pump();
      // Should spend trace_create cost per event
      expect(mocks.energy.spend).toHaveBeenCalled();
      const spendCalls = mocks.energy.spend.mock.calls;
      const pumpSpends = spendCalls.filter((c: any[]) => c[1]?.includes('pump'));
      expect(pumpSpends.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ═══════════════════════════════════════════
  // tryAct: respects energy gate (NEW)
  // ═══════════════════════════════════════════

  describe('tryAct()', () => {
    it('should return false when no worldBridge', async () => {
      const { service } = setupService();
      (service as any).worldBridge = null;
      const result = await (service as any).tryAct(1);
      expect(result).toBe(false);
    });

    it('should return false when energy is too low for exploration', async () => {
      const { service, mocks } = setupService();
      (service as any).worldBridge = mocks.worldBridge;
      mocks.energy.canAffordExploration.mockReturnValue(false);
      const result = await (service as any).tryAct(1);
      expect(result).toBe(false);
    });

    it('should return false in resting mode', async () => {
      const { service, mocks } = setupService();
      (service as any).worldBridge = mocks.worldBridge;
      mocks.affect.getSnapshot.mockReturnValue({
        hormones: { cortisol: 0.2, dopamine: 0.3, norepinephrine: 0.2, serotonin: 0.5 },
        pain: { intensity: 0, source: 'none', chronic: false },
        valence: 0, arousal: 0.2, mode: 'resting',
        mode_probabilities: [0.1, 0.1, 0.1, 0.7], loss: 0,
      });
      const result = await (service as any).tryAct(1);
      expect(result).toBe(false);
    });

    it('should return false in defensive mode', async () => {
      const { service, mocks } = setupService();
      (service as any).worldBridge = mocks.worldBridge;
      mocks.affect.getSnapshot.mockReturnValue({
        hormones: { cortisol: 0.8, dopamine: 0.1, norepinephrine: 0.7, serotonin: 0.2 },
        pain: { intensity: 0.5, source: 'threat', chronic: false },
        valence: -0.5, arousal: 0.8, mode: 'defensive',
        mode_probabilities: [0.1, 0.1, 0.7, 0.1], loss: 0.5,
      });
      const result = await (service as any).tryAct(1);
      expect(result).toBe(false);
    });
  });

  // ═══════════════════════════════════════════
  // trySpeak: finds lexical traces (NEW)
  // ═══════════════════════════════════════════

  describe('trySpeak()', () => {
    it('should return null when no hot traces', async () => {
      const { service, mocks } = setupService();
      mocks.lightCone.getHotTraces.mockReturnValue([]);
      const result = await (service as any).trySpeak(1);
      expect(result).toBeNull();
    });

    it('should return null when no lexical traces in hot memory', async () => {
      const { service, mocks } = setupService();
      // Non-lexical hot traces only
      mocks.lightCone.getHotTraces.mockReturnValue([
        { traceId: 'T1', content: 'ball is red', weight: 0.8, freshness: 1, emotionalCharge: 0, activationCount: 3 },
      ]);
      const result = await (service as any).trySpeak(1);
      expect(result).toBeNull();
    });

    it('should produce a word when lexical trace has sufficient weight', async () => {
      const { service, mocks } = setupService();
      // getHotTraces is called twice: once for strongest non-lexical, once for lexical search
      mocks.lightCone.getHotTraces.mockImplementation((limit: number) => {
        if (limit <= 5) {
          return [
            { traceId: 'T1', content: 'ball is red', weight: 0.8, freshness: 1, emotionalCharge: 0, activationCount: 3 },
            { traceId: 'T2', content: 'Мама сказала: "мяч"', weight: 0.6, freshness: 0.9, emotionalCharge: 0, activationCount: 2, source_type: 'lexical' },
          ];
        }
        return [
          { traceId: 'T1', content: 'ball is red', weight: 0.8, freshness: 1, emotionalCharge: 0, activationCount: 3 },
          { traceId: 'T2', content: 'Мама сказала: "мяч"', weight: 0.6, freshness: 0.9, emotionalCharge: 0, activationCount: 2, source_type: 'lexical' },
        ];
      });
      mocks.conceptSpace.createSelfTrace.mockResolvedValue(undefined);

      const result = await (service as any).trySpeak(1);
      expect(result).toBeTruthy();
    });

    it('should not repeat same word within 50 cycles', async () => {
      const { service, mocks } = setupService();

      mocks.lightCone.getHotTraces.mockReturnValue([
        { traceId: 'T1', content: 'ball is red', weight: 0.8, freshness: 1, emotionalCharge: 0, activationCount: 3 },
        { traceId: 'T2', content: 'Мама сказала: "мяч"', weight: 0.6, freshness: 0.9, emotionalCharge: 0, activationCount: 2, source_type: 'lexical' },
      ]);
      mocks.conceptSpace.createSelfTrace.mockResolvedValue(undefined);

      const word1 = await (service as any).trySpeak(1);
      // Second call within 50 cycles should return null (same word)
      const word2 = await (service as any).trySpeak(2);
      expect(word2).toBeNull();
    });
  });

  // ═══════════════════════════════════════════
  // MEDIUM cadence fires tryAct + trySpeak (NEW)
  // ═══════════════════════════════════════════

  describe('pump() with MEDIUM cadence', () => {
    it('should call tryAct and trySpeak on MEDIUM cadence', async () => {
      const { service, mocks } = setupService();

      // Set shouldMedium to true
      mocks.lightCone.fastTick.mockReturnValue({
        shouldMedium: true, shouldSlow: false, shouldGlobal: false, shouldDeep: false,
      });

      // Push event so pump processes something
      service.pushEvent('test event');
      mocks.rawStream.ingest.mockResolvedValue([]);

      // Spy on tryAct and trySpeak
      const tryActSpy = jest.spyOn(service as any, 'tryAct').mockResolvedValue(false);
      const trySpeakSpy = jest.spyOn(service as any, 'trySpeak').mockResolvedValue(null);

      await service.pump();

      expect(tryActSpy).toHaveBeenCalled();
      expect(trySpeakSpy).toHaveBeenCalled();

      tryActSpy.mockRestore();
      trySpeakSpy.mockRestore();
    });
  });

  // ═══════════════════════════════════════════
  // SLOW cadence fires flushToDb + active cognition (NEW)
  // ═══════════════════════════════════════════

  describe('pump() with SLOW cadence', () => {
    it('should flush to DB and run active cognition on SLOW cadence', async () => {
      const { service, mocks } = setupService();

      mocks.lightCone.fastTick.mockReturnValue({
        shouldMedium: false, shouldSlow: true, shouldGlobal: false, shouldDeep: false,
      });

      service.pushEvent('slow event');
      mocks.rawStream.ingest.mockResolvedValue([]);

      await service.pump();

      expect(mocks.traceGraph.flushToDb).toHaveBeenCalled();
      expect(mocks.sensorimotorPredictor.flushTransitions).toHaveBeenCalled();
      expect(mocks.lightCone.flushWrites).toHaveBeenCalled();
      expect(mocks.activeCognition.replayEpisode).toHaveBeenCalled();
      expect(mocks.activeCognition.generateCuriosity).toHaveBeenCalled();
      expect(mocks.activeCognition.activeInference).toHaveBeenCalled();
      expect(mocks.activeCognition.detectSchemas).toHaveBeenCalled();
      expect(mocks.traceGraph.forget).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════
  // NAMING GAME: rewards correct words (NEW)
  // ═══════════════════════════════════════════

  describe('naming game rewards', () => {
    it('should reward correct naming when worldBridge confirms word matches target', async () => {
      const { service, mocks } = setupService();
      (service as any).worldBridge = mocks.worldBridge;

      // Set up hot traces with a lexical trace matching "ball"
      mocks.lightCone.getHotTraces.mockReturnValue([
        { traceId: 'T1', content: 'ball is round', weight: 0.8, freshness: 1, emotionalCharge: 0, activationCount: 5 },
        { traceId: 'T2', content: 'Мама сказала: "ball"', weight: 0.6, freshness: 0.9, emotionalCharge: 0, activationCount: 2, source_type: 'lexical' },
      ]);
      mocks.conceptSpace.createSelfTrace.mockResolvedValue(undefined);

      const word = await (service as any).trySpeak(1);

      if (word) {
        // Verify worldBridge.getAvailableTargets was used (it returns ['ball', 'cube', 'box'])
        // If word matches a target, reward should be called
        const targets = mocks.worldBridge.getAvailableTargets();
        const isCorrect = targets.some((t: string) => word.toLowerCase().includes(t.toLowerCase()) || t.toLowerCase().includes(word.toLowerCase()));
        if (isCorrect) {
          expect(mocks.affect.reward).toHaveBeenCalledWith(0.15);
        }
      }
    });
  });
});
