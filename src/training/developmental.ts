/**
 * Developmental Training: Reactive Membrane
 *
 * Brain ticks autonomously inside SurrealDB (ASYNC EVENT).
 * Membrane subscribes via LIVE SELECT on kernel_request.
 * When brain wants action → membrane executes in world → writes result back.
 * 0 roundtrips per tick from JS. JS only reacts to brain's requests.
 *
 * Usage: npx tsx src/training/developmental.ts [max_seconds] [target_maturity]
 */

import Surreal from 'surrealdb';
import { PhysicsWorld } from './physics-world';

const MAX_SECONDS = parseInt(process.argv[2] || '300', 10);
const TARGET_MATURITY = parseFloat(process.argv[3] || '0.95');

async function main() {
  const db = new Surreal();
  await db.connect('ws://127.0.0.1:8000/rpc', { versionCheck: false } as any);
  await db.signin({ username: 'root', password: 'root' });
  await db.use({ namespace: 'deus', database: 'runtime' });

  const world = new PhysicsWorld();
  let totalActions = 0;
  let lastCycle = 0;
  const t0 = Date.now();

  console.log(`Reactive membrane: max ${MAX_SECONDS}s, target maturity ${TARGET_MATURITY}`);
  console.log(`Level 0: ${world.getObjectCount()} objects\n`);

  // Feed ambient sensory events periodically
  const ambientInterval = setInterval(async () => {
    try {
      const ambient = world.tick();
      for (const t of ambient) {
        await db.query('CREATE sensory_input SET status = \'pending\', is_consequence = false, action_id = $a, channels = $c, speech = $s, valence = $v, object_idx = $o', {
          a: t.action_id, c: t.channels, s: t.speech, v: t.valence, o: t.object_idx,
        });
      }
    } catch {}
  }, 100); // ambient every 100ms

  // Poll for brain's action requests (EVENT chain commits as a batch, so LIVE SELECT
  // can't see intermediate requests until chain completes. Polling is more reliable.)
  async function processActions() {
    try {
      const reqs = await db.query('SELECT * FROM kernel_request WHERE type = \'action\' AND status = \'pending\' LIMIT 5') as any;
      const pending = Array.isArray(reqs[0]) ? reqs[0] : [];
      for (const req of pending) {
        const method = req.payload?.method ?? 'touch';
        const targetContent = req.payload?.target_content ?? '';
        const actionIdx = ['touch', 'push', 'drop', 'shake', 'look', 'squeeze'].indexOf(method);
        const consequence = world.act(actionIdx >= 0 ? actionIdx : 0);
        totalActions++;
        await db.query(
          'CREATE sensory_input SET status = \'pending\', is_consequence = true, action_id = $aid, channels = $c, speech = $s, valence = $v, object_idx = $o, action_method = $method, target_content = $target',
          { aid: consequence.action_id, c: consequence.channels, s: consequence.speech, v: consequence.valence, o: consequence.object_idx, method, target: targetContent },
        );
        await db.query('UPDATE $id SET status = \'processing\'', { id: req.id });
      }
    } catch {}
  }
  const actionInterval = setInterval(processActions, 100); // poll every 100ms

  // Start the brain (triggers EVENT chain)
  // Clean old data from previous runs
  await db.query('DELETE kernel_request');
  await db.query('DELETE sensory_input');

  // Ensure brain is ready
  await db.query('UPDATE kernel_state SET running = false, energy = 1.0, fatigue = 0.0, debug_break = false');

  console.log('Starting brain...');
  await db.query('UPDATE kernel_state SET running = true');
  // Give EVENT chain a moment to start
  await new Promise(r => setTimeout(r, 500));

  // Monitor progress
  const monitorInterval = setInterval(async () => {
    const elapsed = (Date.now() - t0) / 1000;
    if (elapsed > MAX_SECONDS) {
      console.log(`\nTime limit ${MAX_SECONDS}s reached.`);
      cleanup();
      return;
    }

    try {
      // Re-auth periodically
      if (elapsed % 1500 < 5) {
        await db.signin({ username: 'root', password: 'root' });
        await db.use({ namespace: 'deus', database: 'runtime' });
      }

      const snap = await db.query(`
        LET $s = (SELECT cycle, energy, fatigue, config FROM kernel_state LIMIT 1)[0];
        LET $tr = (SELECT count() AS c FROM trace_state WHERE archived = false GROUP ALL)[0].c ?? 0;
        LET $ar = (SELECT count() AS c FROM trace WHERE archived = true GROUP ALL)[0].c ?? 0;
        LET $ed = (SELECT count() AS c FROM activates WHERE (archived IS NONE OR archived = false) GROUP ALL)[0].c ?? 0;
        LET $h = (SELECT node_id, value, phasic FROM nn_node WHERE model = 'affect' AND layer = 'hidden');
        LET $m = (SELECT node_id, value FROM nn_node WHERE model = 'affect' AND layer = 'mode');
        LET $ce_c = (SELECT count() AS c FROM cognitive_event GROUP ALL)[0].c ?? 0;
        LET $ce_rpe = IF $ce_c > 1 THEN (SELECT math::mean(math::abs(prediction_error)) AS r FROM cognitive_event GROUP ALL)[0].r ?? 0 ELSE 0 END;
        LET $mat = fn::compute_maturity();
        RETURN { s: $s, tr: $tr, ar: $ar, ed: $ed, h: $h, m: $m, rpe: $ce_rpe, mat: $mat, ce: $ce_c };
      `) as any;

      const results = Array.isArray(snap) ? snap : [snap];
      const d = results[results.length - 1] ?? {};
      const s = d.s ?? {};
      const cfg = s.config ?? {};
      const h = Array.isArray(d.h) ? d.h : [];
      const m = Array.isArray(d.m) ? d.m : [];
      const mat = d.mat ?? {};

      const cycle = s.cycle ?? 0;
      const tps = cycle > 0 ? (cycle / elapsed).toFixed(0) : '?';

      console.log(`\n── ${elapsed.toFixed(0)}s | cy=${cycle} (${tps} tps) ──`);
      console.log(`  E=${s.energy?.toFixed(2)} fat=${s.fatigue?.toFixed(2)} | tr=${d.tr}/${d.ar} ed=${d.ed} act=${totalActions} ce=${d.ce} rpe=${d.rpe?.toFixed(4)}`);
      console.log(`  H: ${h.map((n: any) => (n.node_id as string).replace('hormone:', '').slice(0, 4) + '=' + n.value?.toFixed(3) + '(ph' + n.phasic?.toFixed(2) + ')').join(' ')}`);
      console.log(`  M: ${m.map((n: any) => (n.node_id as string).replace('mode:', '').slice(0, 3) + '=' + n.value?.toFixed(3)).join(' ')}`);
      console.log(`  MAT: ${(mat.maturity ?? 0).toFixed(3)} (conv=${(mat.convergence ?? 0).toFixed(2)} ed=${(mat.edges ?? 0).toFixed(2)} pred=${(mat.prediction ?? 0).toFixed(2)} div=${(mat.diversity ?? 0).toFixed(2)})`);
      console.log(`  CFG: drain=${cfg.energy_drain_rate?.toFixed(5)} lr=${cfg.hebbian_lr?.toFixed(5)}`);

      // Auto level-up
      const matVal = mat.maturity ?? 0;
      if (matVal >= (cfg.levelup_maturity_threshold ?? 0.7) && world.getLevel() < 4) {
        world.levelUp();
        console.log(`\n  >>> LEVEL UP to ${world.getLevel()}: ${world.getObjectCount()} objects <<<`);
      }

      if (matVal >= TARGET_MATURITY) {
        console.log(`\n  >>> TARGET MATURITY ${TARGET_MATURITY} REACHED <<<`);
        cleanup();
        return;
      }

      // Check if brain stalled (re-kick if needed)
      if (cycle === lastCycle && cycle > 0) {
        console.log('  [watchdog] Brain stalled, re-kicking...');
        await db.query('UPDATE _ping SET cycle = $cy', { cy: cycle });
      }
      lastCycle = cycle;
    } catch (e: any) {
      if (e.message?.includes('fetch failed') || e.message?.includes('token')) {
        try {
          await db.signin({ username: 'root', password: 'root' });
          await db.use({ namespace: 'deus', database: 'runtime' });
        } catch {}
      }
    }
  }, 5000); // report every 5 seconds

  async function cleanup() {
    clearInterval(ambientInterval);
    clearInterval(actionInterval);
    clearInterval(monitorInterval);
    const totalElapsed = (Date.now() - t0) / 1000;
    try { await db.query('RETURN fn::stop_brain()'); } catch {}
    console.log(`\n═══════════════════════════════════════════`);
    console.log(`TOTAL: ${totalElapsed.toFixed(1)}s, ${totalActions} actions`);
    console.log(`═══════════════════════════════════════════`);
    await db.close();
    process.exit(0);
  }

  // Graceful shutdown
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch(e => { console.error('FATAL:', e.message || e); process.exit(1); });
