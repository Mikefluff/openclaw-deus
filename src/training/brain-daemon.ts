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
import * as fs from 'fs';

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

  // Start brain
  await db.query('UPDATE kernel_state SET running = true');
  console.log('Brain daemon started. Status → ' + STATUS_FILE);
  console.log('Press Ctrl+C to stop.\n');

  let tickCount = 0;
  let lastStatus = Date.now();
  const t0 = Date.now();

  // Brain tick frequencies (matching brain_tick config)
  let cycle = 0;

  while (running) {
    try {
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

      // Energy + sleep (critical)
      await db.query(`
        LET $cfg = (SELECT * FROM kernel_state LIMIT 1)[0].config ?? {};
        UPDATE _cfg_cache SET cfg = $cfg;
        UPDATE kernel_state SET
          cycle = (cycle ?? 0) + 100,
          energy = math::max([0.0, (energy ?? 1.0) - ($cfg.energy_drain_rate ?? 0.005) * 100 * (1.0 + (fatigue ?? 0.0))]),
          fatigue = math::min([1.0, (fatigue ?? 0.0) + ($cfg.fatigue_rate ?? 0.001) * 100]);
        LET $e = (SELECT energy FROM kernel_state LIMIT 1)[0].energy ?? 0;
        IF $e < ($cfg.sleep_threshold ?? 0.15) {
          fn::sleep_consolidation($cfg.nn_decay_rate ?? 0.001);
          UPDATE kernel_state SET energy = math::min([1.5, energy + 0.8]), fatigue = 0.0;
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

      // Agency (every 2nd tick)
      if (cycle % 2 === 0) {
        await db.query('fn::agency_tick($c)', { c: cycle });
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

      // Freshness decay (every tick)
      await db.query(`
        UPDATE trace_state SET freshness = freshness * 0.9995
          WHERE archived = false AND freshness > 0.01;
      `);

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
        const status = {
          timestamp: new Date().toISOString(),
          uptime_s: Math.floor((Date.now() - t0) / 1000),
          ticks: tickCount,
          ticks_per_sec: (tickCount / ((Date.now() - t0) / 1000)).toFixed(1),
          ...report,
        };
        fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 2));

        // Console summary
        const lang = report.language ?? {};
        console.log(
          `[${status.uptime_s}s] cycle=${report.cycle}` +
          ` traces=${report.traces?.active ?? 0}` +
          ` Q=${report.q_learning?.pairs ?? 0}` +
          ` CE=${report.cognitive_events ?? 0}` +
          ` grounded=${lang.grounded_symbols ?? 0}` +
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
