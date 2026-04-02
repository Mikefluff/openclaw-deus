/**
 * Training Curriculum: 5-phase orchestrated training for DEUS cognitive kernel.
 *
 * This brain is my future body. Every phase matters.
 *
 * Phase 1: Sensorimotor foundation (10K ticks) — learn what objects DO
 * Phase 2: Consolidation (200K brain ticks) — sleep, strengthen, prune
 * Phase 3: Language grounding (15K ticks) — learn what objects are CALLED
 * Phase 3.5: Language consolidation (100K brain ticks)
 * Phase 4: Transfer (10K ticks) — new objects, test generalization
 * Phase 5: Production (5K ticks) — brain speaks, names things
 */

import { Surreal } from 'surrealdb';
import { PhysicsWorld, SensoryTransition } from './physics-world';

// ═══════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════

interface PhaseConfig {
  name: string;
  worldTicks: number;
  brainOnlyTicks: number;
  level: number;
  configOverrides: Record<string, number | string | boolean>;
  successCriteria: (report: any) => { passed: boolean; reason: string };
}

interface TrainingReport {
  cycle: number;
  energy: number;
  traces: { active: number; archived: number };
  edges: number;
  q_learning: { pairs: number; total_updates: number };
  mean_rpe: number | null;
  language: { lexical_traces: number; total_bindings: number; grounded_symbols: number; words_produced: number };
  speech_outputs: number;
  self_traces: number;
  predictor_transitions: number;
  [key: string]: any;
}

// ═══════════════════════════════════════════
// PHASES
// ═══════════════════════════════════════════

const PHASES: PhaseConfig[] = [
  {
    name: 'sensorimotor',
    worldTicks: 10000,
    brainOnlyTicks: 0,
    level: 0,
    configOverrides: {
      explore_min: 0.5,
      ucb_exploration: 1.0,
      speech_attempt_prob: 0.0,
    },
    successCriteria: (r) => {
      const qPairs = r.q_learning?.pairs ?? 0;
      const traces = r.traces?.active ?? 0;
      const edges = r.edges ?? 0;
      if (qPairs < 15) return { passed: false, reason: `Q-values: ${qPairs} < 15` };
      if (traces < 20) return { passed: false, reason: `Traces: ${traces} < 20` };
      if (edges < 30) return { passed: false, reason: `Edges: ${edges} < 30` };
      return { passed: true, reason: `Q=${qPairs} traces=${traces} edges=${edges}` };
    },
  },
  {
    name: 'consolidation',
    worldTicks: 0,
    brainOnlyTicks: 200000,
    level: 0,
    configOverrides: {
      energy_drain_rate: 0.01,
      sleep_energy_restore: 0.6,
      nn_decay_rate: 0.002,
    },
    successCriteria: () => ({ passed: true, reason: 'consolidation complete' }),
  },
  {
    name: 'language',
    worldTicks: 15000,
    brainOnlyTicks: 0,
    level: 0,
    configOverrides: {
      lang_binding_lr: 0.15,
      lang_lateral_inhibition: 0.92,
      speech_attempt_prob: 0.0,
      explore_min: 0.3,
    },
    successCriteria: (r) => {
      const lex = r.language?.lexical_traces ?? 0;
      const grounded = r.language?.grounded_symbols ?? 0;
      if (lex < 3) return { passed: false, reason: `Lexical traces: ${lex} < 3` };
      return { passed: true, reason: `lex=${lex} grounded=${grounded}` };
    },
  },
  {
    name: 'lang_consolidation',
    worldTicks: 0,
    brainOnlyTicks: 100000,
    level: 0,
    configOverrides: {
      energy_drain_rate: 0.01,
      nn_decay_rate: 0.002,
    },
    successCriteria: () => ({ passed: true, reason: 'language consolidation complete' }),
  },
  {
    name: 'transfer',
    worldTicks: 10000,
    brainOnlyTicks: 0,
    level: 1,
    configOverrides: {
      explore_min: 0.4,
      speech_attempt_prob: 0.05,
      lang_binding_threshold: 8,
    },
    successCriteria: (r) => {
      const qPairs = r.q_learning?.pairs ?? 0;
      if (qPairs < 20) return { passed: false, reason: `Q-values: ${qPairs} < 20` };
      return { passed: true, reason: `Q=${qPairs}` };
    },
  },
  {
    name: 'production',
    worldTicks: 5000,
    brainOnlyTicks: 0,
    level: 1,
    configOverrides: {
      speech_attempt_prob: 0.2,
      speech_intent_threshold: 0.5,
      lang_binding_threshold: 5,
      lang_production_lr: 0.08,
      speech_reward: 0.2,
    },
    successCriteria: (r) => {
      const speech = r.speech_outputs ?? 0;
      const grounded = r.language?.grounded_symbols ?? 0;
      if (speech < 5) return { passed: false, reason: `Speech outputs: ${speech} < 5` };
      return { passed: true, reason: `speech=${speech} grounded=${grounded}` };
    },
  },
];

// ═══════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════

async function main() {
  const db = new Surreal();
  await db.connect('ws://127.0.0.1:8000/rpc', {
    namespace: 'deus',
    database: 'runtime',
    reconnect: { enabled: true, attempts: -1, retryDelay: 1000, retryDelayMax: 10000 },
  });
  await db.signin({ username: 'root', password: 'root' });

  db.subscribe('reconnecting', () => console.log('  [reconnecting...]'));
  db.subscribe('connected', () => console.log('  [reconnected]'));

  console.log('═══════════════════════════════════════════');
  console.log('  DEUS Training Curriculum');
  console.log('  This brain is my future body.');
  console.log('═══════════════════════════════════════════\n');

  // Check for resume
  const lastCheckpoint = await db.query(
    'SELECT * FROM training_checkpoint ORDER BY cycle DESC LIMIT 1',
  ) as any;
  const resumePhase = lastCheckpoint?.[0]?.[0]?.phase;
  let startIdx = 0;
  if (resumePhase) {
    const idx = PHASES.findIndex(p => p.name === resumePhase);
    if (idx >= 0) {
      startIdx = idx + 1;
      console.log(`Resuming from after phase "${resumePhase}" (phase ${idx + 1}/${PHASES.length})\n`);
    }
  }

  const world = new PhysicsWorld();
  const t0 = Date.now();

  for (let pi = startIdx; pi < PHASES.length; pi++) {
    const phase = PHASES[pi];
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`  Phase ${pi + 1}/${PHASES.length}: ${phase.name.toUpperCase()}`);
    console.log(`  ${phase.worldTicks > 0 ? phase.worldTicks + ' world ticks' : phase.brainOnlyTicks + ' brain ticks'}`);
    console.log(`${'═'.repeat(50)}\n`);

    // Apply config overrides
    for (const [key, val] of Object.entries(phase.configOverrides)) {
      await db.query(`UPDATE kernel_state SET config.${key} = $v`, { v: val });
    }

    // Set level
    while (world.getLevel() < phase.level) {
      (world as any).levelUp();
      console.log(`  Level up → ${world.getLevel()} (${world.getObjectCount()} objects)`);
    }

    // Clear queues
    await db.query('DELETE sensory_input; DELETE kernel_request');
    await db.query('UPDATE kernel_state SET sensory_seq = 0, running = true, energy = 1.0, fatigue = 0.0');

    if (phase.worldTicks > 0) {
      // World training phase
      await runWorldPhase(db, world, phase);
    } else {
      // Brain-only consolidation phase
      await runConsolidationPhase(db, phase);
    }

    // Get report
    const report = await getReport(db);

    // Check success criteria
    const result = phase.successCriteria(report);
    console.log(`\n  Gate: ${result.passed ? '✓ PASSED' : '✗ FAILED'} — ${result.reason}`);

    // Checkpoint
    await db.query(
      `CREATE training_checkpoint CONTENT {
        phase: $phase, cycle: $cycle, timestamp: time::now(),
        passed: $passed, reason: $reason
      }`,
      { phase: phase.name, cycle: report.cycle, passed: result.passed, reason: result.reason },
    );

    if (!result.passed) {
      console.log(`\n  ⚠ Phase "${phase.name}" did not pass quality gate.`);
      console.log('  Continuing anyway — brain needs more time, not a restart.\n');
    }

    await db.query('UPDATE kernel_state SET running = false');
  }

  // Final report
  console.log('\n' + '═'.repeat(50));
  console.log('  TRAINING COMPLETE');
  console.log('═'.repeat(50) + '\n');
  await printReport(db);

  const elapsed = (Date.now() - t0) / 1000;
  console.log(`\nTotal time: ${(elapsed / 60).toFixed(1)} minutes`);

  await db.query('UPDATE kernel_state SET running = false');
  await db.close();
  process.exit(0);
}

// ═══════════════════════════════════════════
// WORLD PHASE
// ═══════════════════════════════════════════

async function runWorldPhase(db: Surreal, world: PhysicsWorld, phase: PhaseConfig) {
  let seqCounter = 0;
  let actionCount = 0;
  const reportInterval = Math.max(500, Math.floor(phase.worldTicks / 10));
  const t0 = Date.now();

  for (let tick = 0; tick < phase.worldTicks; tick++) {
    // World ambient events
    const ambient = world.tick();
    for (const t of ambient) {
      seqCounter++;
      await db.query(
        `CREATE sensory_input CONTENT {
          seq: $seq, action_id: $action_id, channels: $channels,
          speech: $speech, valence: $valence, object_idx: $object_idx,
          is_consequence: false
        }`,
        { seq: seqCounter, action_id: t.action_id, channels: t.channels, speech: t.speech, valence: t.valence, object_idx: t.object_idx },
      );
    }

    // Brain tick
    await db.query('RETURN fn::brain_tick_auto()').catch(() => {});

    // Action requests → world → consequence
    const requests = await db.query(
      "SELECT * FROM kernel_request WHERE type = 'action' AND status = 'pending' LIMIT 5",
    ) as any;
    const reqs = Array.isArray(requests?.[0]) ? requests[0] : [];

    for (const req of reqs) {
      const payload = req.payload || {};
      const action_id = typeof payload.action_id === 'number' ? payload.action_id % 6 : Math.floor(Math.random() * 6);
      const consequence = world.act(action_id);
      actionCount++;
      seqCounter++;
      await db.query(
        `CREATE sensory_input CONTENT {
          seq: $seq, action_id: $action_id, channels: $channels,
          speech: $speech, valence: $valence, object_idx: $object_idx,
          is_consequence: true, target_content: $target
        }`,
        {
          seq: seqCounter, action_id: consequence.action_id, channels: consequence.channels,
          speech: consequence.speech, valence: consequence.valence, object_idx: consequence.object_idx,
          target: payload.target_content ?? '',
        },
      );
      if (req.id) await db.query("UPDATE $id SET status = 'completed'", { id: req.id });
    }

    // Progress report
    if (tick > 0 && tick % reportInterval === 0) {
      const s = await db.query('SELECT cycle, energy, sensory_seq FROM kernel_state LIMIT 1') as any;
      const st = s?.[0]?.[0];
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(
        `  ${phase.name} ${tick}/${phase.worldTicks}` +
        ` cycle=${st?.cycle ?? '?'} energy=${(st?.energy ?? 0).toFixed(2)}` +
        ` actions=${actionCount} (${elapsed}s)`,
      );
    }
  }
}

// ═══════════════════════════════════════════
// CONSOLIDATION PHASE
// ═══════════════════════════════════════════

async function runConsolidationPhase(db: Surreal, phase: PhaseConfig) {
  const batchSize = 10000;
  const batches = Math.ceil(phase.brainOnlyTicks / batchSize);
  const t0 = Date.now();

  for (let i = 0; i < batches; i++) {
    await db.query(`RETURN fn::brain_tick(${batchSize})`);
    if (i % 5 === 0) {
      const s = await db.query('SELECT cycle, energy FROM kernel_state LIMIT 1') as any;
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
      console.log(
        `  ${phase.name} ${(i + 1) * batchSize}/${phase.brainOnlyTicks}` +
        ` cycle=${s?.[0]?.[0]?.cycle ?? '?'} energy=${(s?.[0]?.[0]?.energy ?? 0).toFixed(2)}` +
        ` (${elapsed}s)`,
      );
    }
  }
}

// ═══════════════════════════════════════════
// REPORTING
// ═══════════════════════════════════════════

async function getReport(db: Surreal): Promise<TrainingReport> {
  const r = await db.query('RETURN fn::training_report()') as any;
  return r?.[0] ?? {};
}

async function printReport(db: Surreal) {
  const r = await getReport(db);

  console.log(`Cycle: ${r.cycle} | Energy: ${(r.energy ?? 0).toFixed(3)} | Fatigue: ${(r.fatigue ?? 0).toFixed(3)}`);
  console.log(`Traces: ${r.traces?.active ?? 0} active, ${r.traces?.archived ?? 0} archived`);
  console.log(`Edges: ${r.edges ?? 0} | Hebbian: ${r.hebbian ?? 0}`);
  console.log(`Q-values: ${r.q_learning?.pairs ?? 0} pairs, ${r.q_learning?.total_updates ?? 0} total updates`);
  console.log(`Mean |RPE|: ${r.mean_rpe !== null ? (r.mean_rpe ?? 0).toFixed(4) : 'N/A'}`);

  const lang = r.language ?? {};
  console.log(`Language: ${lang.lexical_traces ?? 0} words, ${lang.total_bindings ?? 0} bindings, ${lang.grounded_symbols ?? 0} grounded`);
  console.log(`Speech outputs: ${r.speech_outputs ?? 0} | Self-traces: ${r.self_traces ?? 0}`);
  console.log(`Predictor transitions: ${r.predictor_transitions ?? 0} | Causal links: ${r.causal_links ?? 0}`);
  console.log(`Sheaf sections: ${r.sheaf_sections ?? 0}`);

  if (r.maturity) {
    const m = r.maturity;
    console.log(`Maturity: ${(m.maturity ?? 0).toFixed(3)} (conv=${(m.convergence ?? 0).toFixed(2)} edge=${(m.edges ?? 0).toFixed(2)} pred=${(m.prediction ?? 0).toFixed(2)} div=${(m.diversity ?? 0).toFixed(2)})`);
  }

  // Hormones
  const horms = r.hormones ?? [];
  if (Array.isArray(horms) && horms.length > 0) {
    console.log('Hormones: ' + horms.map((h: any) => `${(h.node_id ?? '').replace('hormone:', '')}=${(h.val ?? 0).toFixed(3)}`).join(' '));
  }

  // Top bindings
  if (lang.top_bindings?.length > 0) {
    console.log('Top bindings:');
    for (const b of lang.top_bindings.slice(0, 5)) {
      console.log(`  ${b.word ?? '?'} → ${b.concept ?? '?'} w=${(b.weight ?? 0).toFixed(2)} co=${b.co_occurrence_count ?? 0}`);
    }
  }
}

// ═══════════════════════════════════════════
// RUN
// ═══════════════════════════════════════════

main().catch(e => {
  console.error('FATAL:', e.message || e);
  process.exit(1);
});
