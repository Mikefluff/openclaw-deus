/**
 * Brain Daemon: runs brain_tick_auto in a loop until stopped.
 * Like an OS — always on, processing whatever sensory_input arrives.
 * Status dumped to brain-status.json every 10 seconds.
 *
 * Start: npx tsx src/training/brain-daemon.ts
 * Stop:  Ctrl+C or kill the process
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
const STATUS_INTERVAL = 10_000; // 10s
const TICK_DELAY = 50; // ms between ticks (20 ticks/sec max)

let running = true;

process.on('SIGINT', () => { running = false; console.log('\nShutting down...'); });
process.on('SIGTERM', () => { running = false; });

async function main() {
  const db = new Surreal();
  await db.connect('ws://127.0.0.1:8000/rpc', {
    namespace: 'deus',
    database: 'runtime',
    reconnect: { enabled: true, attempts: -1, retryDelay: 1000, retryDelayMax: 10000 },
  });
  await db.signin({ username: 'root', password: 'root' });

  db.subscribe('reconnecting', () => console.log('[reconnecting]'));
  db.subscribe('connected', () => console.log('[connected]'));

  // World simulation
  const world: any = USE_EDEN ? new EdenGarden() : USE_3D ? new PhysicsWorld3D() : new PhysicsWorld();
  let seqCounter = 0;
  let actionCount = 0;

  // Activity log for dashboard
  const activityLog: string[] = [];
  function log(msg: string) {
    activityLog.unshift(`[${new Date().toLocaleTimeString()}] ${msg}`);
    if (activityLog.length > 100) activityLog.length = 100;
  }

  // Latest status for API
  let latestStatus: any = {};

  // HTTP dashboard server
  const DASH_PORT = 3333;
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
  server.listen(DASH_PORT, () => {
    console.log(`Dashboard → http://localhost:${DASH_PORT}`);
  });

  // Start brain
  await db.query('UPDATE kernel_state SET running = true');
  console.log(`Brain daemon started. World: ${world.getObjectCount()} objects. Status → ${STATUS_FILE}`);
  console.log('Press Ctrl+C to stop.\n');

  let tickCount = 0;
  let lastStatus = Date.now();
  const t0 = Date.now();

  // Brain tick frequencies (matching brain_tick config)
  let cycle = 0;

  while (running) {
    try {
      // World tick → feed ambient sensory events
      const ambient = world.tick();
      for (const t of ambient) {
        if (t.action_id === -1) log(`mama: names obj ${t.object_idx} ${t.debug_label ?? ''}`);
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

      // Process sensory inputs
      await db.query(`
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
      `);

      // Energy + fatigue + sleep
      await db.query(`
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
      `);

      // Hormones + affect forward (every 10th tick)
      if (cycle % 10 === 0) {
        await db.query(`
          fn::hormone_decay_tick();
          fn::hormone_drive();
          fn::affect_forward_output();
          fn::apply_config_deltas();
          fn::ecan_collect_rent();
        `);
        // Accumulator decay separately (lightweight)
        await db.query("UPDATE nn_node SET value = value * 0.9995 WHERE model = 'affect' AND layer = 'input' AND value > 0.01");
      }

      // Affect backward (every 50th tick — heaviest single call)
      if (cycle % 50 === 0) {
        await db.query("fn::affect_backward_targeted(0.05)");
      }

      // Agency (every 2nd tick) + execute actions in world
      if (cycle % 2 === 0) {
        await db.query('fn::agency_tick($c)', { c: cycle });

        // Read pending action requests → execute in world → feed consequence
        const requests = await db.query(
          "SELECT * FROM kernel_request WHERE type = 'action' AND status = 'pending' LIMIT 5",
        ) as any;
        const reqs = Array.isArray(requests?.[0]) ? requests[0] : [];
        for (const req of reqs) {
          const payload = req.payload || {};
          const action_id = typeof payload.action_id === 'number' ? payload.action_id % 6 : Math.floor(Math.random() * 6);
          const consequence = world.act(action_id);
          actionCount++;
          log(`action ${action_id} on obj ${consequence.object_idx} → v=${consequence.valence.toFixed(2)} ${consequence.debug_label ?? ''}`);
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

          // Mama feedback (social learning)
          for (const fb of world.drainFeedback()) {
            log(`mama: ${fb.debug_label ?? 'speech'} v=${fb.valence.toFixed(2)}`);
            seqCounter++;
            await db.query(
              `CREATE sensory_input CONTENT {
                seq: $seq, action_id: $action_id, channels: $channels,
                speech: $speech, valence: $valence, object_idx: $object_idx,
                is_consequence: false
              }`,
              { seq: seqCounter, action_id: fb.action_id, channels: fb.channels, speech: fb.speech, valence: fb.valence, object_idx: fb.object_idx },
            );
          }
        }
      }

      // Auto level-up by maturity (every 500th tick)
      if (cycle % 500 === 0 && cycle > 0) {
        try {
          const mat = await db.query('RETURN fn::compute_maturity()') as any;
          const maturity = mat?.[0]?.maturity ?? 0;
          if (maturity > 0.7 && world.getLevel() < 2) {
            (world as any).levelUp();
            console.log(`  LEVEL UP → ${world.getLevel()} (${world.getObjectCount()} objects, maturity=${maturity.toFixed(2)})`);
          }
        } catch {}
      }

      // Medium frequency (every 5th tick)
      if (cycle % 5 === 0) {
        await db.query(`
          LET $cfg = (SELECT * FROM _cfg_cache LIMIT 1)[0].cfg ?? {};
          fn::active_inference($cfg.active_inference_threshold ?? 0.3, $cfg.active_inference_limit ?? 10);
          fn::forget_traces($cfg.forget_weight_threshold ?? 0.02, $cfg.forget_freshness_threshold ?? 0.03);
          fn::apply_meta_modulation();
          fn::ecan_update_hebbian();
        `);
      }

      // Freshness decay + STI rent (every tick)
      await db.query(`
        UPDATE trace_state SET freshness = freshness * 0.9995
          WHERE archived = false AND freshness > 0.01;
      `);
      await db.query('fn::sti_rent()');

      // Hebbian bind: whatever is in AF together gets linked
      // This is where language binding ACTUALLY happens — via co-activation
      await db.query('fn::hebbian_bind_af()').catch(() => {});

      // STI diffusion: activation spreads along learned links
      if (cycle % 3 === 0) {
        await db.query('fn::sti_diffuse()').catch(() => {});
      }

      // Low frequency (every 30th tick)
      if (cycle % 30 === 0) {
        await db.query(`
          fn::consolidation_replay();
          fn::edge_sprout();
          fn::edge_death();
          fn::match_all_patterns();
          fn::ecan_create_hebbian();
          fn::ecan_forget();
        `);
        // Predictor replay: 1 transition at a time (322ms each, not 1.8s for 10)
        await db.query('fn::predictor_replay(1)').catch(() => {});
      }

      // Deep (every 200th tick — heavy ops spread across ticks)
      if (cycle % 200 === 0) {
        await db.query('fn::introspect_self()');
        await db.query('fn::extract_causal_patterns()');
        await db.query('fn::pln_infer_chain()');
      }
      if (cycle % 500 === 0) {
        await db.query('fn::extract_all_sections()').catch(() => {});
        await db.query('fn::build_world_model()').catch(() => {});
        await db.query('fn::introspect()').catch(() => {});
      }

      cycle++;
      tickCount++;
    } catch {}

    // Status dump
    if (Date.now() - lastStatus > STATUS_INTERVAL) {
      lastStatus = Date.now();
      try {
        const r = await db.query('RETURN fn::training_report()') as any;
        const report = r?.[0] ?? {};
        const positions = USE_EDEN ? (world as EdenGarden).getSnapshot().objects.map(o => ({ idx: o.idx, x: o.x, y: o.y, z: o.z, name: o.name, color: o.color }))
          : USE_3D ? (world as PhysicsWorld3D).getAllPositions() : [];
        const status = {
          timestamp: new Date().toISOString(),
          uptime_s: Math.floor((Date.now() - t0) / 1000),
          ticks: tickCount,
          ticks_per_sec: (tickCount / ((Date.now() - t0) / 1000)).toFixed(1),
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

        // Console summary
        const lang = report.language ?? {};
        console.log(
          `[${status.uptime_s}s] cycle=${report.cycle}` +
          ` traces=${report.traces?.active ?? 0}` +
          ` Q=${report.q_learning?.pairs ?? 0}` +
          ` CE=${report.cognitive_events ?? 0}` +
          ` grounded=${lang.grounded_symbols ?? 0}` +
          ` actions=${actionCount}` +
          ` tps=${status.ticks_per_sec}`,
        );
      } catch {}
    }

    // Small delay to not hammer the DB
    await new Promise(r => setTimeout(r, TICK_DELAY));
  }

  await db.query('UPDATE kernel_state SET running = false');
  console.log('Brain stopped. Final status in ' + STATUS_FILE);
  await db.close();
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
