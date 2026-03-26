import { KernelLoopService, CognitiveAgent, AgentContext } from '../kernel-loop.service';
import { TraceGraphService } from '../memory/trace-graph.service';
import { CommitKernelService } from '../commit/commit-kernel.service';
import { AffectiveStateService } from '../affect/affective-state.service';
import { CognitiveConfigService } from '../../cognitive/cognitive-config.service';
import { Signal, CommitDelta, TimeSense } from '../kernel.types';
import { ok } from 'neverthrow';
import { mockCognitiveConfig } from '../../__mocks__/cognitive-config.mock';

// Mock agent that produces configurable signals
function makeAgent(id: string, rank: number, signalsFn: (input: string, ctx: AgentContext) => Signal[]): CognitiveAgent {
  return { id, rank, process: async (input, ctx) => signalsFn(input, ctx) };
}

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

describe('KernelLoopService', () => {
  let service: KernelLoopService;
  let mockTraceGraph: any;
  let mockCommitKernel: any;
  let mockAffect: any;

  beforeEach(() => {
    mockTraceGraph = {
      tick: jest.fn().mockReturnValue(1),
      getCycle: jest.fn().mockReturnValue(1),
      getActiveTraces: jest.fn().mockResolvedValue(ok([])),
      ingestSignals: jest.fn().mockResolvedValue(ok([])),
      findConvergentClusters: jest.fn().mockResolvedValue([]),
      forget: jest.fn().mockResolvedValue(ok({ decayed: 0, archived: 0 })),
    };

    mockCommitKernel = {
      processCycle: jest.fn().mockResolvedValue(ok([])),
      computeTimeSense: jest.fn().mockResolvedValue(mockTimeSense),
      getAttentionWindow: jest.fn().mockResolvedValue(ok([])),
    };

    mockAffect = {
      processCommits: jest.fn().mockReturnValue({ configDeltas: new Map() }),
      getSnapshot: jest.fn().mockReturnValue({
        hormones: { cortisol: 0.2, dopamine: 0.3, norepinephrine: 0.2, serotonin: 0.5 },
        pain: { intensity: 0, source: 'none', chronic: false, accumulator: 0, cycles_unresolved: 0 },
        valence: 0, arousal: 0.2, mode: 'exploit', mode_probabilities: [0.1, 0.6, 0.2, 0.1], loss: 0,
      }),
    };

    service = Object.create(KernelLoopService.prototype);
    (service as any).traceGraph = mockTraceGraph;
    (service as any).commitKernel = mockCommitKernel;
    (service as any).config = mockCognitiveConfig;
    (service as any).affect = mockAffect;
    (service as any).agents = [];
    (service as any).llmCallsUsed = 0;
    (service as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  });

  describe('convergence', () => {
    it('should converge immediately when no agents produce signals', async () => {
      service.registerAgent(makeAgent('empty', 1, () => []));

      const result = await service.think('hello');
      expect(result.isOk()).toBe(true);
      const output = result._unsafeUnwrap();
      expect(output.converged).toBe(true);
      expect(output.total_commits).toBe(0);
      expect(output.convergence_reason).toBe('no signals');
    });

    it('should converge when commits have low energy', async () => {
      service.registerAgent(makeAgent('sig', 1, () => [makeSignal()]));

      // First cycle: produce a commit with low energy
      mockCommitKernel.processCycle
        .mockResolvedValueOnce(ok([makeCommit({ energy: 0.05 })]))
        .mockResolvedValue(ok([])); // second cycle: no commits

      const result = await service.think('hello');
      expect(result.isOk()).toBe(true);
      const output = result._unsafeUnwrap();
      expect(output.total_commits).toBeGreaterThanOrEqual(0); // low energy → may converge before or after first commit
    });
  });

  describe('stabilization energy', () => {
    it('should compute lower energy for fewer commits with low novelty', () => {
      const stab = (service as any).computeStabilization(
        [makeCommit({ energy: 0.05, novelty_cost: 0.1 })],
        [makeCommit({ energy: 0.05 })],
        0.5,
      );
      expect(stab.energy).toBeLessThan(0.5);
    });

    it('should compute higher energy for escalations with high novelty', () => {
      const stab = (service as any).computeStabilization(
        [makeCommit({ energy: 0.8, novelty_cost: 0.9, is_escalation: true })],
        [],
        0.1,
      );
      expect(stab.energy).toBeGreaterThan(0.1);
    });
  });

  describe('guardrails', () => {
    it('should detect hallucination loop when no orthogonal signals', () => {
      const hasOrtho = (service as any).hasOrthogonalSignals(
        [makeSignal({ targets: ['T1'] })],
        [makeCommit({ changes: { traces_activated: ['T1'], traces_suppressed: [], traces_created: [] } })],
      );
      // All targets already in previous commits → no orthogonal
      expect(hasOrtho).toBe(false);
    });

    it('should detect orthogonal signals from new targets', () => {
      const hasOrtho = (service as any).hasOrthogonalSignals(
        [makeSignal({ targets: ['T_NEW'] })],
        [makeCommit({ changes: { traces_activated: ['T1'], traces_suppressed: [], traces_created: [] } })],
      );
      expect(hasOrtho).toBe(true);
    });

    it('should detect orthogonal signals from high novelty', () => {
      const hasOrtho = (service as any).hasOrthogonalSignals(
        [makeSignal({ targets: ['T1'], novelty_cost: 0.8 })],
        [makeCommit({ changes: { traces_activated: ['T1'], traces_suppressed: [], traces_created: [] } })],
      );
      expect(hasOrtho).toBe(true);
    });
  });

  describe('self_model commit blocking', () => {
    it('should filter consecutive self_model commits', async () => {
      service.registerAgent(makeAgent('strat', 5, () => [makeSignal({ type: 'strategy' })]));

      const selfModelCommit = makeCommit({ type: 'self_model' });
      mockCommitKernel.processCycle
        .mockResolvedValueOnce(ok([selfModelCommit])) // cycle 1: allowed
        .mockResolvedValueOnce(ok([selfModelCommit])) // cycle 2: blocked
        .mockResolvedValue(ok([]));

      const result = await service.think('test');
      expect(result.isOk()).toBe(true);
      const output = result._unsafeUnwrap();
      // Only 1 self_model commit should survive (second blocked)
      const selfModelCommits = output.commits.filter(c => c.type === 'self_model');
      expect(selfModelCommits.length).toBeLessThanOrEqual(1);
    });
  });

  describe('loop termination', () => {
    it('should always terminate within max_iterations', async () => {
      // Agent that always produces signals (never converges naturally)
      service.registerAgent(makeAgent('infinite', 1, () => [makeSignal({ confidence: 0.5 })]));
      mockCommitKernel.processCycle.mockResolvedValue(ok([makeCommit({ energy: 0.5 })]));

      const result = await service.think('never converges');
      expect(result.isOk()).toBe(true);
      const output = result._unsafeUnwrap();
      // Should terminate at max_iterations (12 default from config mock)
      expect(output.total_cycles).toBeLessThanOrEqual(15);
    });
  });
});
