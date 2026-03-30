import { SensorimotorPredictorService } from '../sensorimotor-predictor.service';

// ── Mocks ──────────────────────────────────────────────────────────────
const mockDb = {
  query: jest.fn().mockResolvedValue({ isOk: () => true, isErr: () => false, value: [] }),
  create: jest.fn().mockResolvedValue({ isOk: () => true, isErr: () => false, value: {} }),
  execute: jest.fn().mockResolvedValue({ isOk: () => true, isErr: () => false, value: {} }),
};

// Mock nn_forward to return tanh-activated delta values
function setupGraphMock() {
  mockDb.query.mockImplementation((sql: string) => {
    if (typeof sql === 'string' && sql.includes('nn_forward')) {
      return Promise.resolve({
        isOk: () => true, isErr: () => false,
        value: Array.from({ length: 8 }, (_, i) => ({
          node_id: `delta_dim:${i}`,
          value: (Math.random() - 0.5) * 0.8, // tanh-like values in ~[-0.4, 0.4]
        })),
      });
    }
    return Promise.resolve({ isOk: () => true, isErr: () => false, value: [] });
  });
}

const mockConfig = {
  get: jest.fn((key: string) => {
    const defaults: Record<string, number> = {
      'predictor.beta_kl': 0.1,
      'predictor.decorrelation_weight': 0.1,
      'predictor.codebook_size': 64,
      'predictor.vq_weight': 0.1,
    };
    return defaults[key] ?? 0;
  }),
};

function createService(): SensorimotorPredictorService {
  const svc = new SensorimotorPredictorService(mockDb as any, mockConfig as any);
  (svc as any).initWeights();
  setupGraphMock();
  return svc;
}

// ── Helpers ────────────────────────────────────────────────────────────
const POS_DIM = 8;

function randomPos(dim = POS_DIM): number[] {
  return Array.from({ length: dim }, () => Math.random() * 2 - 1);
}

describe('SensorimotorPredictorService', () => {
  let svc: SensorimotorPredictorService;

  beforeEach(() => {
    jest.clearAllMocks();
    svc = createService();
  });

  // ═══════════════════════════════════════════
  // predict()
  // ═══════════════════════════════════════════
  describe('predict()', () => {
    it('returns predicted_position with correct dimensions', async () => {
      const result = await svc.predict(randomPos(), 'push');
      expect(result.predicted_position).toHaveLength(POS_DIM);
    });

    it('returns uncertainty array with correct dimensions', async () => {
      const result = await svc.predict(randomPos(), 'push');
      expect(result.uncertainty).toHaveLength(POS_DIM);
    });

    it('returns confidence in [0, 1]', async () => {
      const result = await svc.predict(randomPos(), 'push');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('empty position returns zero-padded result', async () => {
      const result = await svc.predict([], 'look_closely');
      expect(result.predicted_position).toHaveLength(POS_DIM);
      result.predicted_position.forEach(v => expect(Number.isFinite(v)).toBe(true));
    });

    it('handles short positions by padding', async () => {
      const result = await svc.predict([1, 2, 3], 'drop');
      expect(result.predicted_position).toHaveLength(POS_DIM);
      expect(result.uncertainty).toHaveLength(POS_DIM);
    });

    it('calls graph forward for delta prediction', async () => {
      await svc.predict(randomPos(), 'push');
      // Should have called nn_set_inputs + nn_forward
      const execCalls = mockDb.execute.mock.calls.filter(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('nn_set_inputs'),
      );
      expect(execCalls.length).toBeGreaterThanOrEqual(1);
      const queryCalls = mockDb.query.mock.calls.filter(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('nn_forward'),
      );
      expect(queryCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ═══════════════════════════════════════════
  // recordTransition()
  // ═══════════════════════════════════════════
  describe('recordTransition()', () => {
    it('calls db.create with correct table and fields', async () => {
      await svc.recordTransition([1, 2, 3], [4, 5, 6], 'push', 0.5, 10);
      expect(mockDb.create).toHaveBeenCalledWith(
        'sensorimotor_transition',
        expect.objectContaining({
          action: 'push',
          reward: 0.5,
          cycle: 10,
          trained: false,
        }),
      );
    });

    it('pads position_t to posDim', async () => {
      await svc.recordTransition([1], [2], 'touch', 0, 1);
      const callArg = mockDb.create.mock.calls[0][1];
      expect(callArg.position_t).toHaveLength(POS_DIM);
      expect(callArg.position_t1).toHaveLength(POS_DIM);
      expect(callArg.position_t[0]).toBe(1);
      expect(callArg.position_t[1]).toBe(0);
    });
  });

  // ═══════════════════════════════════════════
  // trainOnBatch()
  // ═══════════════════════════════════════════
  describe('trainOnBatch()', () => {
    it('returns loss=0 and count=0 when no transitions', async () => {
      mockDb.query.mockResolvedValueOnce({ isOk: () => true, isErr: () => false, value: [] });
      const result = await svc.trainOnBatch();
      expect(result).toEqual({ loss: 0, count: 0 });
    });

    it('processes transitions and returns positive count', async () => {
      const transitions = [
        { position_t: randomPos(), position_t1: randomPos(), action: 'push', reward: 0, cycle: 1 },
        { position_t: randomPos(), position_t1: randomPos(), action: 'drop', reward: 0.5, cycle: 2 },
      ];
      // First query returns transitions, subsequent queries are nn_forward calls
      mockDb.query.mockResolvedValueOnce({ isOk: () => true, isErr: () => false, value: transitions });

      const result = await svc.trainOnBatch();
      expect(result.count).toBe(2);
      expect(typeof result.loss).toBe('number');
      expect(Number.isFinite(result.loss)).toBe(true);
    });

    it('marks transitions as trained', async () => {
      const transitions = [
        { position_t: randomPos(), position_t1: randomPos(), action: 'push', reward: 0, cycle: 1 },
      ];
      mockDb.query.mockResolvedValueOnce({ isOk: () => true, isErr: () => false, value: transitions });

      await svc.trainOnBatch(5);
      const trainedCalls = mockDb.execute.mock.calls.filter(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('trained = true'),
      );
      expect(trainedCalls.length).toBeGreaterThanOrEqual(1);
    });

    it('returns loss=0 and count=0 when query returns error', async () => {
      mockDb.query.mockResolvedValueOnce({ isOk: () => false, isErr: () => true, value: [] });
      const result = await svc.trainOnBatch();
      expect(result).toEqual({ loss: 0, count: 0 });
    });
  });

  // ═══════════════════════════════════════════
  // forward/backward invariants
  // ═══════════════════════════════════════════
  describe('forward/backward invariants', () => {
    it('gradients are clamped to [-1, 1]', () => {
      const clamp = (svc as any).clamp.bind(svc);
      expect(clamp(5)).toBe(1);
      expect(clamp(-5)).toBe(-1);
      expect(clamp(0.3)).toBeCloseTo(0.3);
    });

    it('loss is finite (no NaN/Infinity)', async () => {
      const pos = randomPos();
      const target = randomPos();
      await (svc as any).forward(pos, 'push');
      const predicted = (svc as any).lastInput.slice(0, POS_DIM).map((p: number, i: number) => p + ((svc as any).lastDelta[i] || 0));
      const loss = (svc as any).computeLoss(predicted, target, 0.5);
      expect(Number.isFinite(loss)).toBe(true);
      expect(Number.isNaN(loss)).toBe(false);
    });

    it('uncertainty is always positive (softplus)', async () => {
      await (svc as any).forward(randomPos(), 'push');
      const unc: number[] = (svc as any).lastUncertainty;
      unc.forEach(u => {
        expect(u).toBeGreaterThan(0);
      });
    });

    it('backward calls graph for delta weight update', async () => {
      await (svc as any).forward(randomPos(), 'push');
      await (svc as any).backward(randomPos(), 0.5);
      const bwdCalls = mockDb.execute.mock.calls.filter(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('nn_backward'),
      );
      expect(bwdCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ═══════════════════════════════════════════
  // updatePosDim()
  // ═══════════════════════════════════════════
  describe('updatePosDim()', () => {
    it('expanding dim updates JS supplement weights', () => {
      svc.updatePosDim(12);
      const expectedInputDim = 12 + 8;
      expect((svc as any).W_unc.length).toBe(expectedInputDim);
      expect((svc as any).W_unc[0].length).toBe(12);
      expect((svc as any).W_delta_t2.length).toBe(expectedInputDim);
      expect((svc as any).W_delta_t2[0].length).toBe(12);
    });

    it('shrinking dim is a no-op', () => {
      const dimBefore = (svc as any).posDim;
      svc.updatePosDim(dimBefore - 2);
      expect((svc as any).posDim).toBe(dimBefore);
    });
  });

  // ═══════════════════════════════════════════
  // ensureAction()
  // ═══════════════════════════════════════════
  describe('ensureAction()', () => {
    it('new actions get added to index', () => {
      const sizeBefore = (svc as any).actionIndex.size;
      (svc as any).ensureAction('fly_to_moon');
      expect((svc as any).actionIndex.has('fly_to_moon')).toBe(true);
      expect((svc as any).actionIndex.size).toBe(sizeBefore + 1);
    });

    it('W_action grows for new actions', () => {
      const rowsBefore = (svc as any).W_action.length;
      (svc as any).ensureAction('teleport');
      expect((svc as any).W_action.length).toBe(rowsBefore + 1);
      expect((svc as any).W_action[(svc as any).W_action.length - 1]).toHaveLength(8);
    });
  });

  // ═══════════════════════════════════════════
  // computeEmpowerment()
  // ═══════════════════════════════════════════
  describe('computeEmpowerment()', () => {
    it('returns 0 when fewer than 2 actions known', () => {
      (svc as any).actionIndex = new Map([['push', 0]]);
      const result = svc.computeEmpowerment(randomPos());
      expect(result).toBe(0);
    });

    it('returns bounded value (no NaN/Infinity)', () => {
      const result = svc.computeEmpowerment(randomPos());
      expect(Number.isFinite(result)).toBe(true);
      expect(Number.isNaN(result)).toBe(false);
    });
  });

  // ═══════════════════════════════════════════
  // explorationDrive()
  // ═══════════════════════════════════════════
  describe('explorationDrive()', () => {
    it('combines uncertainty + empowerment', () => {
      const pos = randomPos();
      const drive = svc.explorationDrive(pos, 'push', 0.5);
      const uncertainty = svc.getUncertainty(pos, 'push');
      const empowerment = svc.computeEmpowerment(pos);
      expect(drive).toBeCloseTo(0.5 * uncertainty + 0.5 * empowerment, 8);
    });

    it('alpha=1 returns pure uncertainty', () => {
      const pos = randomPos();
      const drive = svc.explorationDrive(pos, 'push', 1.0);
      const uncertainty = svc.getUncertainty(pos, 'push');
      expect(drive).toBeCloseTo(uncertainty, 8);
    });

    it('returns finite positive number', () => {
      const drive = svc.explorationDrive(randomPos(), 'push');
      expect(Number.isFinite(drive)).toBe(true);
      expect(drive).toBeGreaterThanOrEqual(0);
    });
  });
});
