/**
 * Developmental Training: brain starts as newborn, grows through experience.
 *
 * No fixed sessions. Brain sleeps when tired, wakes up, explores.
 * Level-up when developmental maturity crosses threshold.
 * Runs until target maturity or max ticks.
 *
 * Usage: npx tsx src/training/developmental.ts [max_ticks] [target_maturity]
 */

import Surreal from 'surrealdb';
import { PhysicsWorld, SensoryTransition } from './physics-world';

const MAX_TICKS = parseInt(process.argv[2] || '50000', 10);
const TARGET_MATURITY = parseFloat(process.argv[3] || '0.8');

async function main() {
  const db = new Surreal();
  await db.connect('http://127.0.0.1:8000/rpc', { versionCheck: false } as any);
  await db.signin({ username: 'root', password: 'root' });
  await db.use({ namespace: 'deus', database: 'runtime' });

  // Re-auth every 30 minutes to prevent token expiry
  let lastAuth = Date.now();
  async function ensureAuth() {
    if (Date.now() - lastAuth > 25 * 60 * 1000) {
      await db.signin({ username: 'root', password: 'root' });
      await db.use({ namespace: 'deus', database: 'runtime' });
      lastAuth = Date.now();
    }
  }

  // Kill conflicting events
  for (const ev of [
    'kernel_heartbeat ON kernel_state', 'critical_loop ON sched_critical',
    'high_loop ON sched_high', 'medium_loop ON sched_medium', 'low_loop ON sched_low',
    'kernel_wake ON kernel_event', 'cognitive_spread ON trace', 'cognitive_archive ON trace',
    'cognitive_hebbian ON activates', 'cognitive_backprop ON commit_log', 'nn_hebbian ON nn_edge',
  ]) { try { await db.query('REMOVE EVENT IF EXISTS ' + ev); } catch {} }

  await db.query('DEFINE TABLE OVERWRITE kernel_request SCHEMALESS');
  await db.query('DEFINE TABLE OVERWRITE brain_action SCHEMALESS');
  await db.query('DEFINE TABLE OVERWRITE activates SCHEMALESS TYPE RELATION FROM trace TO trace');
  await db.query('UPDATE kernel_state SET cycle = 0, energy = 1.0, fatigue = 0.0, running = true');

  const world = new PhysicsWorld();
  console.log(`Developmental training: max ${MAX_TICKS} ticks, target maturity ${TARGET_MATURITY}`);
  console.log(`Level 0: ${world.getObjectCount()} objects\n`);

  let totalActions = 0;
  let sleepCount = 0;
  let levelUps = 0;
  const t0 = Date.now();

  for (let tick = 0; tick < MAX_TICKS; tick++) {
    // ── ROUNDTRIP #1: world_tick — perceive + think + decide ──
    const ambient = world.tick();
    const events = ambient.map(t => ({
      action_id: t.action_id, channels: t.channels, speech: t.speech,
      valence: t.valence, object_idx: t.object_idx,
    }));

    let worldResult: any;
    try {
      const r = await db.query('RETURN fn::world_tick($events, $ticks)', { events, ticks: 100 }) as any;
      worldResult = r[0] || {};
    } catch { worldResult = {}; }

    // ── ROUNDTRIP #2 (only if brain wants to act): execute + consequence ──
    if (worldResult.action) {
      const act = worldResult.action;
      const actionIdx = ['touch', 'push', 'drop', 'shake', 'look', 'squeeze'].indexOf(act.method);
      const consequence = world.act(actionIdx >= 0 ? actionIdx : 0);
      totalActions++;

      try {
        await db.query(
          'RETURN fn::action_consequence($rid, $method, $target, $channels, $speech, $valence, $oidx, $aid)',
          {
            rid: act.request_id, method: act.method, target: act.target_content,
            channels: consequence.channels, speech: consequence.speech,
            valence: consequence.valence, oidx: consequence.object_idx,
            aid: consequence.action_id,
          },
        );
      } catch {}
    }

    // Energy check (read from worldResult to avoid extra roundtrip)
    const cycle = worldResult.cycle ?? 0;
    if (cycle > 0 && cycle % 10000 < 100) sleepCount++; // approximate

    // Re-auth periodically
    if (tick % 500 === 0) await ensureAuth();

    // Progress report every 1000 ticks — SINGLE batched query
    if (tick % 1000 === 0 && tick > 0) {
      const elapsed = (Date.now() - t0) / 1000;
      try {
        // One roundtrip for ALL stats
        const snap = await db.query(`
          LET $tr = (SELECT count() AS c FROM trace WHERE archived = false GROUP ALL)[0].c ?? 0;
          LET $ar = (SELECT count() AS c FROM trace WHERE archived = true GROUP ALL)[0].c ?? 0;
          LET $ed = (SELECT count() AS c FROM activates GROUP ALL)[0].c ?? 0;
          LET $h = (SELECT node_id, value, phasic FROM nn_node WHERE model = 'affect' AND layer = 'hidden');
          LET $m = (SELECT node_id, value FROM nn_node WHERE model = 'affect' AND layer = 'mode');
          LET $s = (SELECT cycle, energy, fatigue, config FROM kernel_state LIMIT 1)[0];
          LET $mat = fn::compute_maturity();
          LET $rpe = (SELECT math::mean(math::abs(prediction_error)) AS r FROM cognitive_event WHERE cycle > ($s.cycle - 50000) GROUP ALL)[0].r ?? 0;
          RETURN { tr: $tr, ar: $ar, ed: $ed, h: $h, m: $m, s: $s, mat: $mat, rpe: $rpe };
        `) as any;

        const d = snap[0] ?? {};
        const s = d.s ?? {};
        const cfg = s.config ?? {};
        const h = Array.isArray(d.h) ? d.h : [];
        const m = Array.isArray(d.m) ? d.m : [];
        const mat = d.mat ?? {};

        console.log(`\n── tick=${tick}/${MAX_TICKS} (${elapsed.toFixed(0)}s) ──`);
        console.log(`  cy=${s.cycle} E=${s.energy?.toFixed(2)} fat=${s.fatigue?.toFixed(2)} | tr=${d.tr}/${d.ar} ed=${d.ed} act=${totalActions} rpe=${d.rpe?.toFixed(4)}`);
        console.log(`  H: ${h.map((n: any) => (n.node_id as string).replace('hormone:', '').slice(0, 4) + '=' + n.value?.toFixed(3) + '(ph' + n.phasic?.toFixed(2) + ')').join(' ')}`);
        console.log(`  M: ${m.map((n: any) => (n.node_id as string).replace('mode:', '').slice(0, 3) + '=' + n.value?.toFixed(3)).join(' ')}`);
        console.log(`  MATURITY: ${(mat.maturity ?? 0).toFixed(3)} (conv=${(mat.convergence ?? 0).toFixed(2)} ed=${(mat.edges ?? 0).toFixed(2)} pred=${(mat.prediction ?? 0).toFixed(2)} div=${(mat.diversity ?? 0).toFixed(2)})`);
        console.log(`  CFG: drain=${cfg.energy_drain_rate?.toFixed(5)} fat=${cfg.fatigue_rate?.toFixed(5)} sleep=${cfg.sleep_threshold?.toFixed(3)} lr=${cfg.hebbian_lr?.toFixed(5)}`);

        // Auto level-up
        const matVal = mat.maturity ?? 0;
        if (matVal >= (cfg.levelup_maturity_threshold ?? 0.5) && world.getLevel() < 4) {
          world.levelUp();
          levelUps++;
          console.log(`\n  >>> LEVEL UP to ${world.getLevel()}: ${world.getObjectCount()} objects (maturity=${matVal.toFixed(3)}) <<<`);
        }

        if (matVal >= TARGET_MATURITY) {
          console.log(`\n  >>> TARGET MATURITY ${TARGET_MATURITY} REACHED at tick ${tick} <<<`);
          break;
        }
      } catch (e: any) {
        console.log(`  tick=${tick} snapshot error: ${e.message?.slice(0, 80)}`);
      }
    }
  }

  const totalElapsed = (Date.now() - t0) / 1000;
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`TOTAL: ${MAX_TICKS} ticks, ${totalElapsed.toFixed(1)}s, ${totalActions} actions, ${sleepCount} sleep events, ${levelUps} level-ups`);
  console.log(`═══════════════════════════════════════════`);

  await db.query('UPDATE kernel_state SET running = false');
  await db.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message || e); process.exit(1); });
