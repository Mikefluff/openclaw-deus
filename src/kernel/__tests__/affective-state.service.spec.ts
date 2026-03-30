import { AffectiveStateService } from '../affect/affective-state.service';
import { CommitDelta, TimeSense } from '../kernel.types';

// Mock SurrealService — simulate graph forward/backward responses
const mockDb = {
  query: jest.fn().mockResolvedValue({ isOk: () => true, value: [] }),
  create: jest.fn().mockResolvedValue({ isOk: () => true, value: {} }),
  execute: jest.fn().mockResolvedValue({ isOk: () => true, value: {} }),
};

// Return hormone values from fn::nn_forward for affect hidden layer
function mockForwardHormones() {
  mockDb.query.mockResolvedValueOnce({
    isOk: () => true,
    value: [
      { node_id: 'hormone:cortisol', value: 0.6 },
      { node_id: 'hormone:dopamine', value: 0.4 },
      { node_id: 'hormone:norepinephrine', value: 0.5 },
      { node_id: 'hormone:serotonin', value: 0.45 },
    ],
  });
  // Config deltas from fn::nn_forward affect output
  mockDb.query.mockResolvedValueOnce({
    isOk: () => true,
    value: [
      { node_id: 'config:convergence_threshold', value: 0.01 },
      { node_id: 'config:spread_factor', value: -0.005 },
      { node_id: 'config:hebbian_lr', value: 0.002 },
      { node_id: 'config:energy_threshold', value: 0.0 },
      { node_id: 'config:activation_boost', value: 0.001 },
      { node_id: 'config:freshness_decay', value: -0.001 },
    ],
  });
  // Mode softmax result from fn::nn_softmax
  mockDb.query.mockResolvedValueOnce({
    isOk: () => true,
    value: [
      { node_id: 'mode:explore', value: 0.3 },
      { node_id: 'mode:exploit', value: 0.4 },
      { node_id: 'mode:defensive', value: 0.2 },
      { node_id: 'mode:resting', value: 0.1 },
    ],
  });
}

const mockConfig = {
  get: jest.fn((key: string) => {
    const defaults: Record<string, number> = {
      'affect.accumulator_decay_rate': 0.03,
      'affect.config_delta_max': 0.02,
      'affect.mode_boundary_positive': 0.5,
      'affect.mode_boundary_negative': -0.5,
    };
    return defaults[key] ?? 0;
  }),
};

function createService(): AffectiveStateService {
  return new AffectiveStateService(mockDb as any, mockConfig as any);
}

function makeCommit(overrides: Partial<CommitDelta> = {}): CommitDelta {
  return {
    commit_id: 'c1',
    cycle: 1,
    type: 'perceptual',
    source_agents: ['a1'],
    convergence_score: 0.5,
    is_escalation: false,
    changes: { traces_activated: [], traces_suppressed: [], traces_created: [] },
    novelty_cost: 0.1,
    prediction_error: 0.2,
    maturity: 0.5,
    urgency: 0.3,
    energy: 0.3,
    ...overrides,
  };
}

function makeTimeSense(overrides: Partial<TimeSense> = {}): TimeSense {
  return {
    cycle: 1,
    tempo: 1,
    novelty_rate: 0.5,
    prediction_error_rate: 0.1,
    trace_decay_velocity: 0.01,
    dilation: 1,
    rhythm_phase: 'active',
    ...overrides,
  };
}

describe('AffectiveStateService', () => {
  let svc: AffectiveStateService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = createService();
  });

  describe('processCommits()', () => {
    it('updates accumulators from commit metrics', async () => {
      const accBefore = [...(svc as any).acc];
      mockForwardHormones();
      await svc.processCommits([makeCommit({ prediction_error: 0.8 })], makeTimeSense());
      const accAfter = (svc as any).acc;
      const anyDifferent = accBefore.some((v: number, i: number) => v !== accAfter[i]);
      expect(anyDifferent).toBe(true);
    });

    it('returns configDeltas map', async () => {
      mockForwardHormones();
      const result = await svc.processCommits([makeCommit()], makeTimeSense());
      expect(result.configDeltas).toBeInstanceOf(Map);
    });

    it('calls fn::nn_set_inputs to set accumulator values', async () => {
      mockForwardHormones();
      await svc.processCommits([makeCommit()], makeTimeSense());
      // fn::nn_set_inputs called via db.execute
      const setCalls = mockDb.execute.mock.calls.filter(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('nn_set_inputs'),
      );
      expect(setCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('calls fn::nn_forward for hidden and output layers', async () => {
      mockForwardHormones();
      await svc.processCommits([makeCommit()], makeTimeSense());
      // Should have queried for hormones, config, and modes
      const fwdCalls = mockDb.query.mock.calls.filter(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('nn_forward'),
      );
      expect(fwdCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('calls fn::nn_backward_layer for edge weight updates', async () => {
      mockForwardHormones();
      await svc.processCommits([makeCommit()], makeTimeSense());
      const bwdCalls = mockDb.execute.mock.calls.filter(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('nn_backward_layer'),
      );
      expect(bwdCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('computeLoss()', () => {
    it('equals acc[0] + acc[2] - acc[3] - acc[4]', () => {
      const acc = (svc as any).acc as number[];
      acc[0] = 0.5;
      acc[2] = 0.3;
      acc[3] = 0.1;
      acc[4] = 0.2;
      const loss = (svc as any).computeLoss();
      expect(loss).toBeCloseTo(0.5 + 0.3 - 0.1 - 0.2, 6);
    });
  });

  describe('getSnapshot()', () => {
    it('returns valid hormones, pain, valence, arousal, mode', async () => {
      mockForwardHormones();
      await svc.processCommits([makeCommit()], makeTimeSense());
      const snap = svc.getSnapshot();
      expect(snap.hormones).toBeDefined();
      expect(snap.pain).toBeDefined();
      expect(typeof snap.valence).toBe('number');
      expect(typeof snap.arousal).toBe('number');
      expect(['explore', 'exploit', 'defensive', 'resting']).toContain(snap.mode);
    });

    it('mode_probabilities sum to ~1.0', async () => {
      mockForwardHormones();
      await svc.processCommits([makeCommit()], makeTimeSense());
      const snap = svc.getSnapshot();
      const sum = snap.mode_probabilities.reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1.0, 1);
      expect(snap.mode_probabilities).toHaveLength(4);
    });

    it('hormones from graph are in [0,1]', async () => {
      mockForwardHormones();
      await svc.processCommits([makeCommit()], makeTimeSense());
      const snap = svc.getSnapshot();
      for (const val of [snap.hormones.cortisol, snap.hormones.dopamine, snap.hormones.norepinephrine, snap.hormones.serotonin]) {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('inflictPain()', () => {
    it('increases pain accumulator', () => {
      const before = (svc as any).acc[2];
      svc.inflictPain('test', 1.0);
      expect((svc as any).acc[2]).toBeGreaterThan(before);
    });
  });

  describe('reward()', () => {
    it('increases reward accumulator and reduces pain', () => {
      svc.inflictPain('test', 2.0);
      const painBefore = (svc as any).acc[2];
      const rewardBefore = (svc as any).acc[4];
      svc.reward(1.0);
      expect((svc as any).acc[4]).toBeGreaterThan(rewardBefore);
      expect((svc as any).acc[2]).toBeLessThan(painBefore);
    });
  });

  describe('valence', () => {
    it('always in [-1, 1]', async () => {
      svc.reward(5.0);
      mockForwardHormones();
      await svc.processCommits([makeCommit()], makeTimeSense());
      let snap = svc.getSnapshot();
      expect(snap.valence).toBeGreaterThanOrEqual(-1);
      expect(snap.valence).toBeLessThanOrEqual(1);

      svc.inflictPain('extreme', 5.0);
      mockForwardHormones();
      await svc.processCommits([makeCommit()], makeTimeSense());
      snap = svc.getSnapshot();
      expect(snap.valence).toBeGreaterThanOrEqual(-1);
      expect(snap.valence).toBeLessThanOrEqual(1);
    });
  });

  describe('arousal', () => {
    it('always in [0, 1]', async () => {
      svc.inflictPain('stress', 3.0);
      mockForwardHormones();
      await svc.processCommits([makeCommit({ prediction_error: 1.0 })], makeTimeSense());
      const snap = svc.getSnapshot();
      expect(snap.arousal).toBeGreaterThanOrEqual(0);
      expect(snap.arousal).toBeLessThanOrEqual(1);
    });
  });

  describe('loss direction', () => {
    it('loss is negative when reward > pain', () => {
      (svc as any).acc[0] = 0;
      (svc as any).acc[2] = 0;
      (svc as any).acc[3] = 1.0;
      (svc as any).acc[4] = 2.0;
      const loss = (svc as any).computeLoss();
      expect(loss).toBeLessThan(0);
    });
  });

  describe('accumulator decay', () => {
    it('values decrease toward 0 over cycles', async () => {
      (svc as any).acc[0] = 3.0;
      for (let i = 0; i < 10; i++) {
        mockForwardHormones();
        await svc.processCommits([], makeTimeSense({ tempo: 0 }));
      }
      expect((svc as any).acc[0]).toBeLessThan(3.0);
    });
  });
});
