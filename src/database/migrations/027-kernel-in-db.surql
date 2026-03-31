-- Migration 027: Kernel Lives Inside SurrealDB
-- Default mode runs entirely as fn::kernel_tick().
-- NestJS is just the membrane — subscribes via LIVE SELECT.

-- ═══════════════════════════════════════════
-- 1. KERNEL STATE (singleton)
-- ═══════════════════════════════════════════

DEFINE TABLE IF NOT EXISTS kernel_state SCHEMALESS;
DEFINE FIELD cycle              ON kernel_state TYPE int DEFAULT 0;
DEFINE FIELD energy             ON kernel_state TYPE float DEFAULT 1.0;
DEFINE FIELD max_energy         ON kernel_state TYPE float DEFAULT 1.5;
DEFINE FIELD fatigue            ON kernel_state TYPE float DEFAULT 0.0;
DEFINE FIELD cycles_since_sleep ON kernel_state TYPE int DEFAULT 0;
DEFINE FIELD total_spent        ON kernel_state TYPE float DEFAULT 0.0;
DEFINE FIELD mode               ON kernel_state TYPE string DEFAULT 'default';
DEFINE FIELD last_tick_at       ON kernel_state TYPE datetime DEFAULT time::now();
DEFINE FIELD phenomenal         ON kernel_state TYPE option<object>;
DEFINE FIELD scope              ON kernel_state TYPE option<object>;

-- ═══════════════════════════════════════════
-- 2. KERNEL REQUEST (kernel → NestJS periphery)
-- ═══════════════════════════════════════════

DEFINE TABLE IF NOT EXISTS kernel_request SCHEMAFULL;
DEFINE FIELD type       ON kernel_request TYPE string;
DEFINE FIELD payload    ON kernel_request TYPE option<object>;
DEFINE FIELD status     ON kernel_request TYPE string DEFAULT 'pending';
DEFINE FIELD created_at ON kernel_request TYPE datetime DEFAULT time::now();
DEFINE FIELD claimed_at ON kernel_request TYPE option<datetime>;
DEFINE FIELD result     ON kernel_request TYPE option<object>;

DEFINE INDEX IF NOT EXISTS idx_kr_status ON kernel_request FIELDS status;

-- ═══════════════════════════════════════════
-- 3. KERNEL EVENT (NestJS → kernel)
-- ═══════════════════════════════════════════

DEFINE TABLE IF NOT EXISTS kernel_event SCHEMAFULL;
DEFINE FIELD type       ON kernel_event TYPE string;
DEFINE FIELD content    ON kernel_event TYPE string;
DEFINE FIELD source     ON kernel_event TYPE option<string>;
DEFINE FIELD payload    ON kernel_event TYPE option<object>;
DEFINE FIELD status     ON kernel_event TYPE string DEFAULT 'pending';
DEFINE FIELD created_at ON kernel_event TYPE datetime DEFAULT time::now();

DEFINE INDEX IF NOT EXISTS idx_ke_status ON kernel_event FIELDS status;

-- ═══════════════════════════════════════════
-- 4. fn::kernel_tick — THE BRAIN
-- One call = one cognitive cycle, entirely in Rust.
-- ═══════════════════════════════════════════

DEFINE FUNCTION OVERWRITE fn::kernel_tick($cycle: int) {
  -- Get or create state
  LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  IF $state = NONE {
    CREATE kernel_state CONTENT {
      cycle: 0, energy: 1.0, max_energy: 1.5, fatigue: 0.0,
      cycles_since_sleep: 0, total_spent: 0.0, mode: 'default',
      last_tick_at: time::now()
    };
    LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
  };

  -- ── LOAD CONFIG (from kernel_state.config object, set by affect model) ──
  -- Thresholds stored IN kernel_state itself — not in separate table.
  -- Affect model modulates these via fn::nn_forward config deltas.
  LET $cfg = $state.config ?? {};
  LET $cfg_drain = $cfg.energy_drain_rate ?? 0.002;
  LET $cfg_fatigue_rate = $cfg.fatigue_rate ?? 0.001;
  LET $cfg_sleep_threshold = $cfg.sleep_threshold ?? 0.1;
  LET $cfg_nightly_fatigue = $cfg.nightly_fatigue_threshold ?? 0.3;
  LET $cfg_nightly_energy = $cfg.nightly_energy_threshold ?? 0.5;
  LET $cfg_trace_decay = $cfg.trace_weight_decay ?? 0.999;
  LET $cfg_freshness_decay = $cfg.freshness_decay ?? 0.999;
  LET $cfg_trace_min_weight = $cfg.trace_min_weight ?? 0.05;

  -- ── ENERGY TICK ──
  LET $fatigue = $state.fatigue ?? 0.0;
  LET $drain = $cfg_drain * (1.0 + $fatigue);
  LET $energy = math::max([0.0, ($state.energy ?? 1.0) - $drain]);
  LET $fatigue = math::min([1.0, $fatigue + $cfg_fatigue_rate]);

  -- ── COGNITIVE SCOPE ──
  LET $scope_raw = fn::compute_cognitive_scope();
  LET $depth = IF type::is_object($scope_raw) THEN $scope_raw.suggested_depth ?? 1 ELSE 1 END;
  LET $spread = IF type::is_object($scope_raw) THEN $scope_raw.suggested_spread ?? 10 ELSE 10 END;

  -- Depth thresholds from kernel_state config (affect model modulates via config deltas)
  LET $depth_reflect = $cfg.depth_reflect ?? 3;
  LET $depth_restructure = $cfg.depth_restructure ?? 5;
  LET $depth_consolidate = $cfg.depth_consolidate ?? 10;

  -- ── LOCAL (always): affect forward + trace decay ──
  -- Run affect model forward pass (hormones update from accumulators)
  fn::nn_forward('affect', 'input', 'hidden');
  fn::nn_forward('affect', 'hidden', 'output');

  -- Trace weight/freshness decay
  UPDATE trace SET
    weight = math::clamp(weight * $cfg_trace_decay, 0.0, 1.0),
    freshness = freshness * $cfg_freshness_decay
  WHERE archived = false AND weight > $cfg_trace_min_weight;

  -- ── REFLECT (depth 3+) ──
  IF $depth >= $depth_reflect {
    -- Active inference
    fn::active_inference(0.3, 10);

    -- Schema detection
    fn::detect_schemas_native(3, 10);

    -- Forgetting
    fn::forget_traces(0.02, 0.03);

    -- Drift
    fn::drift_traces(0.01, 0.02, $cycle);

    -- Predictor: neural graph forward on cone for learning feedback
    fn::nn_forward('cone', 'input', 'output');

    LET $energy = math::max([0.0, $energy - 0.01]);
  };

  -- ── RESTRUCTURE (depth 5+) ──
  IF $depth >= $depth_restructure {
    fn::nn_decay_all(0.001);
    fn::consolidate_episodic(3);
    fn::belief_decay(0.005);
    fn::narrative_compact(50);
    LET $energy = math::max([0.0, $energy - 0.02]);
  };

  -- ── CONSOLIDATE (depth 10+) ──
  IF $depth >= $depth_consolidate {
    fn::build_world_model();
    fn::introspect();
    LET $energy = math::max([0.0, $energy - 0.03]);
  };

  -- ── NIGHTLY (autonomous: brain decides based on internal state) ──
  -- No magic numbers. Triggers when:
  --   fatigue is high (system worked hard)
  --   AND energy recovered (just slept or resting)
  --   AND processing depth allows it
  -- This is the brain saying "I need maintenance" — not a cron job.
  IF $fatigue > $cfg_nightly_fatigue AND $energy > $cfg_nightly_energy AND $depth >= $depth_restructure {
    fn::nightly_run();
    LET $energy = math::max([0.0, $energy - 0.1]);
    LET $fatigue = math::max([0.0, $fatigue - 0.2]);
  };

  -- ── SLEEP (energy depleted — brain decides, not NestJS) ──
  LET $needs_sleep = $energy < $cfg_sleep_threshold;
  IF $needs_sleep {
    fn::sleep_consolidation(0.001);
    LET $energy = math::min([($state.max_energy ?? 1.5), $energy + 0.8]);
    LET $fatigue = 0.0;
  };

  -- ── PHENOMENAL STATE ──
  LET $dominant = (SELECT trace_id, content, weight FROM trace
    WHERE archived = false ORDER BY weight DESC LIMIT 10);
  LET $conflicts = (SELECT in.content AS a, out.content AS b, weight AS w
    FROM inhibits WHERE weight > $cfg_trace_min_weight
    ORDER BY w DESC LIMIT 5);

  -- ── UPDATE STATE ──
  UPDATE kernel_state SET
    cycle = $cycle,
    energy = $energy,
    fatigue = $fatigue,
    cycles_since_sleep = IF $needs_sleep THEN 0 ELSE cycles_since_sleep + 1 END,
    total_spent = total_spent + $drain,
    last_tick_at = time::now(),
    mode = 'default',
    phenomenal = {
      dominant_traces: $dominant,
      conflicts: $conflicts
    },
    scope = $scope;

  RETURN {
    cycle: $cycle,
    energy: $energy,
    fatigue: $fatigue,
    depth: $depth,
    spread: $spread,
    needs_sleep: $needs_sleep
  };
};

-- ═══════════════════════════════════════════
-- 5. EVENT: external event → wake kernel to periphery
-- ═══════════════════════════════════════════

DEFINE EVENT IF NOT EXISTS kernel_wake ON kernel_event
  ASYNC RETRY 2
  WHEN $event = 'CREATE' AND $after.status = 'pending'
  THEN {
    UPDATE kernel_state SET mode = 'periphery';
  };

-- ═══════════════════════════════════════════
-- 6. fn::kernel_spend — energy spending (called from periphery)
-- ═══════════════════════════════════════════

DEFINE FUNCTION IF NOT EXISTS fn::kernel_spend($amount: float, $reason: string) {
  UPDATE kernel_state SET
    energy = math::max([0.0, energy - $amount]),
    total_spent = total_spent + $amount;
  RETURN true;
};

-- ═══════════════════════════════════════════
-- 7. fn::kernel_sleep — force sleep from periphery
-- ═══════════════════════════════════════════

DEFINE FUNCTION IF NOT EXISTS fn::kernel_sleep() {
  LET $result = fn::sleep_consolidation(0.001);
  UPDATE kernel_state SET
    energy = math::min([max_energy, energy + 0.8]),
    fatigue = 0.0,
    cycles_since_sleep = 0,
    mode = 'default';
  RETURN $result;
};

-- ═══════════════════════════════════════════
-- 8. fn::kernel_get_state — read current state
-- ═══════════════════════════════════════════

DEFINE FUNCTION IF NOT EXISTS fn::kernel_get_state() {
  RETURN (SELECT * FROM kernel_state LIMIT 1)[0];
};

-- ═══════════════════════════════════════════
-- 9. SELF-TRIGGER: brain ticks itself
-- kernel_state UPDATE → EVENT → fn::kernel_tick → UPDATE kernel_state → ...
-- Chain depth up to 256. Watchdog re-kicks when exhausted.
-- ═══════════════════════════════════════════

DEFINE EVENT IF NOT EXISTS kernel_heartbeat ON kernel_state
  ASYNC RETRY 1 MAXDEPTH 16
  WHEN $event = 'UPDATE' AND $after.running = true
  THEN {
    fn::kernel_tick(($after.cycle ?? 0) + 1);
  };
