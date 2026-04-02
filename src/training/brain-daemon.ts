/**
 * Brain Daemon v2: event-driven, non-blocking.
 *
 * Brain circuits fire independently at their own frequencies.
 * No await chains. Fire and forget. Like a real brain.
 *
 * Start: npx tsx src/training/brain-daemon.ts [--eden|--3d]
 * Dashboard: http://localhost:3333
 * Status: cat brain-status.json
 */

import { Surreal } from 'surrealdb';
import { PhysicsWorld } from './physics-world';
import { PhysicsWorld3D } from './physics-world-3d';
import { EdenGarden } from './eden';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';

const USE_3D = process.argv.includes('--3d');
const USE_EDEN = process.argv.includes('--eden');
const STATUS_FILE = 'brain-status.json';

let running = true;
process.on('SIGINT', () => { running = false; console.log('\nShutting down...'); });
process.on('SIGTERM', () => { running = false; });

async function main() {
  const db = new Surreal();
  await db.connect('ws://127.0.0.1:8000/rpc', {
    namespace: 'deus', database: 'runtime',
    reconnect: { enabled: true, attempts: -1, retryDelay: 1000, retryDelayMax: 10000 },
  });
  await db.signin({ username: 'root', password: 'root' });
  db.subscribe('reconnecting', () => console.log('[reconnecting]'));

  const world: any = USE_EDEN ? new EdenGarden() : USE_3D ? new PhysicsWorld3D() : new PhysicsWorld();
  const activityLog: string[] = [];
  let latestStatus: any = {};
  let seqCounter = 0;
  let actionCount = 0;
  let tickCount = 0;

  function log(msg: string) {
    activityLog.unshift(`[${new Date().toLocaleTimeString()}] ${msg}`);
    if (activityLog.length > 100) activityLog.length = 100;
  }

  // Dashboard
  const dashHtml = fs.readFileSync(path.join(__dirname, 'dashboard.html'), 'utf-8');
  const server = http.createServer((req, res) => {
    if (req.url === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ ...latestStatus, _log: activityLog.slice(0, 30) }));
    } else {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(dashHtml);
    }
  });
  server.listen(3333, () => console.log('Dashboard → http://localhost:3333'));

  await db.query('UPDATE kernel_state SET running = true');
  console.log(`Brain daemon v2. World: ${USE_EDEN ? 'Eden' : USE_3D ? '3D' : 'flat'} (${world.getObjectCount()} objects)`);
  console.log('Parallel circuits. Fire and forget.\n');

  const t0 = Date.now();

  // ═══════════════════════════════════════════
  // CIRCUIT: Sensory — world tick + feed inputs (50ms interval)
  // Only this circuit is synchronous with the world.
  // ═══════════════════════════════════════════
  const sensoryLoop = setInterval(async () => {
    if (!running) return;
    try {
      const ambient = world.tick();
      for (const t of ambient) {
        if (t.action_id === -1) log(`mama: ${t.debug_label ?? 'speech'}`);
        seqCounter++;
        db.query(`CREATE sensory_input CONTENT {
          seq: $seq, action_id: $action_id, channels: $channels,
          speech: $speech, valence: $valence, object_idx: $object_idx,
          is_consequence: false
        }`, { seq: seqCounter, action_id: t.action_id, channels: t.channels, speech: t.speech, valence: t.valence, object_idx: t.object_idx }).catch(() => {});
      }

      // Process pending inputs
      db.query(`
        LET $state = (SELECT * FROM kernel_state LIMIT 1)[0];
        IF $state.running ?? false = true {
          LET $cursor = $state.sensory_seq ?? 0;
          LET $inputs = (SELECT * FROM sensory_input WHERE seq > $cursor LIMIT 20);
          FOR $inp IN $inputs { fn::process_one_input($inp); };
          IF array::len($inputs) > 0 {
            LET $seqs = $inputs.map(|$i| $i.seq ?? 0);
            UPDATE kernel_state SET sensory_seq = math::max($seqs) ?? $cursor;
          };
        };
      `).catch(() => {});
    } catch {}
  }, 50);

  // ═══════════════════════════════════════════
  // CIRCUIT: Vitals — energy, fatigue, sleep (200ms)
  // ═══════════════════════════════════════════
  const vitalsLoop = setInterval(() => {
    if (!running) return;
    db.query(`
      LET $cfg = (SELECT * FROM kernel_state LIMIT 1)[0].config ?? {};
      UPDATE _cfg_cache SET cfg = $cfg;
      UPDATE kernel_state SET
        cycle = (cycle ?? 0) + 100,
        energy = math::max([0.0, (energy ?? 1.0) - ($cfg.energy_drain_rate ?? 0.002) * (1.0 + (fatigue ?? 0.0))]),
        fatigue = math::min([1.0, (fatigue ?? 0.0) + ($cfg.fatigue_rate ?? 0.005)]);
      LET $e = (SELECT energy FROM kernel_state LIMIT 1)[0].energy ?? 0;
      IF $e < ($cfg.sleep_threshold ?? 0.15) {
        fn::sleep_consolidation($cfg.nn_decay_rate ?? 0.001);
        UPDATE kernel_state SET
          energy = math::min([1.5, energy + ($cfg.sleep_energy_restore ?? 0.5)]),
          fatigue = math::max([0.0, fatigue * 0.5]);
      };
    `).catch(() => {});
    tickCount++;
  }, 200);

  // ═══════════════════════════════════════════
  // CIRCUIT: Attention — STI rent + Hebbian bind + diffusion (100ms)
  // ═══════════════════════════════════════════
  const attentionLoop = setInterval(() => {
    if (!running) return;
    db.query("UPDATE trace_state SET freshness = freshness * 0.9995 WHERE archived = false AND freshness > 0.01").catch(() => {});
    db.query('fn::sti_rent()').catch(() => {});
    db.query('fn::hebbian_bind_af()').catch(() => {});
  }, 100);

  // STI diffusion (300ms)
  const diffuseLoop = setInterval(() => {
    if (!running) return;
    db.query('fn::sti_diffuse()').catch(() => {});
  }, 300);

  // ═══════════════════════════════════════════
  // CIRCUIT: Affect — hormones + forward/backward (1s / 5s)
  // ═══════════════════════════════════════════
  const hormoneLoop = setInterval(() => {
    if (!running) return;
    db.query(`
      fn::hormone_decay_tick(); fn::hormone_drive();
      fn::affect_forward_output(); fn::apply_config_deltas();
      fn::ecan_collect_rent();
    `).catch(() => {});
    db.query("UPDATE nn_node SET value = value * 0.9995 WHERE model = 'affect' AND layer = 'input' AND value > 0.01").catch(() => {});
  }, 1000);

  const backwardLoop = setInterval(() => {
    if (!running) return;
    db.query("fn::affect_backward_targeted(0.05)").catch(() => {});
  }, 5000);

  // ═══════════════════════════════════════════
  // CIRCUIT: Agency — action selection + world execution (500ms)
  // ═══════════════════════════════════════════
  const agencyLoop = setInterval(async () => {
    if (!running) return;
    try {
      await db.query('fn::agency_tick(0)');
      const requests = await db.query("SELECT * FROM kernel_request WHERE type = 'action' AND status = 'pending' LIMIT 5") as any;
      const reqs = Array.isArray(requests?.[0]) ? requests[0] : [];
      for (const req of reqs) {
        const payload = req.payload || {};
        const action_id = typeof payload.action_id === 'number' ? payload.action_id % 6 : Math.floor(Math.random() * 6);
        const consequence = world.act(action_id);
        actionCount++;
        log(`action ${action_id} → ${consequence.debug_label ?? ''} v=${consequence.valence.toFixed(2)}`);
        seqCounter++;
        db.query(`CREATE sensory_input CONTENT {
          seq: $seq, action_id: $action_id, channels: $channels,
          speech: $speech, valence: $valence, object_idx: $object_idx,
          is_consequence: true, target_content: $target
        }`, {
          seq: seqCounter, action_id: consequence.action_id, channels: consequence.channels,
          speech: consequence.speech, valence: consequence.valence, object_idx: consequence.object_idx,
          target: payload.target_content ?? '',
        }).catch(() => {});
        if (req.id) db.query("UPDATE $id SET status = 'completed'", { id: req.id }).catch(() => {});
        for (const fb of world.drainFeedback()) {
          log(`mama: ${fb.debug_label ?? 'feedback'}`);
          seqCounter++;
          db.query(`CREATE sensory_input CONTENT {
            seq: $seq, action_id: $action_id, channels: $channels,
            speech: $speech, valence: $valence, object_idx: $object_idx,
            is_consequence: false
          }`, { seq: seqCounter, action_id: fb.action_id, channels: fb.channels, speech: fb.speech, valence: fb.valence, object_idx: fb.object_idx }).catch(() => {});
        }
      }
    } catch {}
  }, 500);

  // ═══════════════════════════════════════════
  // CIRCUIT: Learning — spreading, forgetting, edges (2s)
  // ═══════════════════════════════════════════
  const learningLoop = setInterval(() => {
    if (!running) return;
    db.query(`
      LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
      fn::active_inference($cfg.active_inference_threshold ?? 0.3, $cfg.active_inference_limit ?? 10);
      fn::forget_traces($cfg.forget_weight_threshold ?? 0.02, $cfg.forget_freshness_threshold ?? 0.03);
      fn::apply_meta_modulation();
      fn::ecan_update_hebbian();
    `).catch(() => {});
  }, 2000);

  // ═══════════════════════════════════════════
  // CIRCUIT: Plasticity — edges, consolidation, predictor (5s)
  // ═══════════════════════════════════════════
  const plasticityLoop = setInterval(() => {
    if (!running) return;
    db.query('fn::consolidation_replay()').catch(() => {});
    db.query('fn::edge_sprout()').catch(() => {});
    db.query('fn::edge_death()').catch(() => {});
    db.query('fn::ecan_create_hebbian()').catch(() => {});
    db.query('fn::predictor_replay(1)').catch(() => {});
  }, 5000);

  // ═══════════════════════════════════════════
  // CIRCUIT: Deep — introspection, PLN, sheaves, level-up (30s)
  // ═══════════════════════════════════════════
  const deepLoop = setInterval(async () => {
    if (!running) return;
    db.query('fn::introspect_self()').catch(() => {});
    db.query('fn::extract_causal_patterns()').catch(() => {});
    db.query('fn::pln_infer_chain()').catch(() => {});
    db.query('fn::extract_all_sections()').catch(() => {});
    db.query('fn::build_world_model()').catch(() => {});
    // Level-up
    try {
      const mat = await db.query('RETURN fn::compute_maturity()') as any;
      const maturity = mat?.[0]?.maturity ?? 0;
      if (maturity > 0.55 && world.getLevel() < 2) {
        (world as any).advanceStage?.() || (world as any).levelUp?.();
        log(`LEVEL UP → stage ${world.getLevel()} (${world.getObjectCount()} objects, maturity=${maturity.toFixed(2)})`);
      }
    } catch {}
  }, 30000);

  // ═══════════════════════════════════════════
  // STATUS: periodic report (10s)
  // ═══════════════════════════════════════════
  const statusLoop = setInterval(async () => {
    if (!running) return;
    try {
      const r = await db.query('RETURN fn::training_report()') as any;
      const report = r?.[0] ?? {};
      const positions = USE_EDEN
        ? (world as EdenGarden).getSnapshot().objects.map((o: any) => ({ idx: o.idx, x: o.x, y: o.y, z: o.z, name: o.name, color: o.color }))
        : USE_3D ? (world as PhysicsWorld3D).getAllPositions() : [];

      const status = {
        timestamp: new Date().toISOString(),
        uptime_s: Math.floor((Date.now() - t0) / 1000),
        ticks: tickCount,
        ticks_per_sec: (tickCount / Math.max(1, (Date.now() - t0) / 1000)).toFixed(1),
        actions: actionCount,
        world_level: world.getLevel(),
        world_objects: world.getObjectCount(),
        world_3d: USE_3D || USE_EDEN,
        world_eden: USE_EDEN,
        eden_stage: USE_EDEN ? (world as EdenGarden).getStage() : undefined,
        eden_relations: USE_EDEN ? (world as EdenGarden).getSnapshot().relations : undefined,
        object_positions: positions,
        ...report,
      };
      latestStatus = status;
      fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));

      const lang = report.language ?? {};
      console.log(
        `[${status.uptime_s}s] cycle=${report.cycle}` +
        ` traces=${report.traces?.active ?? 0}` +
        ` Q=${report.q_learning?.pairs ?? 0}` +
        ` edges=${report.edges ?? 0}` +
        ` grounded=${lang.grounded_symbols ?? 0}` +
        ` actions=${actionCount}` +
        ` tps=${status.ticks_per_sec}`,
      );
    } catch {}
  }, 10000);

  // ═══════════════════════════════════════════
  // SHUTDOWN
  // ═══════════════════════════════════════════
  const shutdown = async () => {
    clearInterval(sensoryLoop);
    clearInterval(vitalsLoop);
    clearInterval(attentionLoop);
    clearInterval(diffuseLoop);
    clearInterval(hormoneLoop);
    clearInterval(backwardLoop);
    clearInterval(agencyLoop);
    clearInterval(learningLoop);
    clearInterval(plasticityLoop);
    clearInterval(deepLoop);
    clearInterval(statusLoop);
    await db.query('UPDATE kernel_state SET running = false').catch(() => {});
    server.close();
    console.log('Brain stopped.');
    await db.close();
    process.exit(0);
  };

  // Wait for shutdown signal
  const check = setInterval(() => { if (!running) { clearInterval(check); shutdown(); } }, 500);
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
