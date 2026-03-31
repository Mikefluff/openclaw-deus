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

  async function feedTransition(t: SensoryTransition) {
    try {
      await db.query(
        'RETURN fn::process_sensory($a, $c, $s, $v, $o)',
        { a: t.action_id, c: t.channels, s: t.speech, v: t.valence, o: t.object_idx },
      );
    } catch {}
  }

  let totalActions = 0;
  let sleepCount = 0;
  let levelUps = 0;
  const t0 = Date.now();

  for (let tick = 0; tick < MAX_TICKS; tick++) {
    // World ambient
    const ambient = world.tick();
    for (const t of ambient) await feedTransition(t);

    // Brain thinks
    try {
      await db.query('RETURN fn::brain_tick(100)');
    } catch {}

    // Process action requests
    const requests = await db.query(
      'SELECT * FROM kernel_request WHERE type = \'action\' AND status = \'pending\' LIMIT 5',
    ) as any;
    const reqs = Array.isArray(requests[0]) ? requests[0] : [];
    for (const req of reqs) {
      const action_id = Math.floor(Math.random() * 6);
      const consequence = world.act(action_id);
      totalActions++;
      await feedTransition(consequence);

      // Three-factor edge learning
      const consKey = `${consequence.action_id}:${consequence.object_idx}`;
      try {
        await db.query(
          `LET $to = (SELECT * FROM trace WHERE content = $key AND archived = false LIMIT 1)[0];
           IF $to != NONE AND $to.id != NONE {
             LET $pe = 1.0 / (1.0 + ($to.reactivation_count ?? 0));
             LET $r = (SELECT id FROM trace WHERE archived = false AND id != $to.id LIMIT 3);
             FOR $x IN $r { IF $x.id IS NOT NONE { fn::learn_edge($x.id, $to.id, $v, $pe); }; };
           }`,
          { key: consKey, v: consequence.valence },
        );
      } catch {}

      // Mode learning on valence events
      if (Math.abs(consequence.valence) > 0.01) {
        try { await db.query('RETURN fn::mode_learn($v)', { v: consequence.valence }); } catch {}
      }

      if (req.id) try { await db.query('UPDATE $id SET status = \'completed\'', { id: req.id }); } catch {}
    }

    // Check for sleep (brain sleeps autonomously via brain_tick, but track it)
    const state = await db.query('SELECT energy, fatigue, cycle FROM kernel_state LIMIT 1') as any;
    const s = state[0]?.[0] || {};
    if ((s.energy ?? 1) < 0.15) sleepCount++;

    // Re-auth periodically
    if (tick % 500 === 0) await ensureAuth();

    // Progress report every 1000 ticks
    if (tick % 1000 === 0 && tick > 0) {
      const elapsed = (Date.now() - t0) / 1000;
      const traces = await db.query('SELECT count() AS c FROM trace WHERE archived = false GROUP ALL') as any;
      const archived = await db.query('SELECT count() AS c FROM trace WHERE archived = true GROUP ALL') as any;
      const edges = await db.query('SELECT count() AS c FROM activates GROUP ALL') as any;
      const h = (await db.query('SELECT node_id, value, phasic FROM nn_node WHERE model = \'affect\' AND layer = \'hidden\'') as any)[0] || [];
      const m = (await db.query('SELECT node_id, value FROM nn_node WHERE model = \'affect\' AND layer = \'mode\'') as any)[0] || [];
      const cfg = (await db.query('SELECT config FROM kernel_state LIMIT 1') as any)[0]?.[0]?.config || {};

      let maturity: any = {};
      try { maturity = (await db.query('RETURN fn::compute_maturity()') as any)[0] || {}; } catch {}

      const trC = traces[0]?.[0]?.c ?? traces[0]?.c ?? '?';
      const arC = archived[0]?.[0]?.c ?? archived[0]?.c ?? 0;
      const edC = edges[0]?.[0]?.c ?? edges[0]?.c ?? 0;

      console.log(`\n── tick=${tick}/${MAX_TICKS} (${elapsed.toFixed(0)}s) ──`);
      console.log(`  cy=${s.cycle} E=${s.energy?.toFixed(2)} fat=${s.fatigue?.toFixed(2)} | tr=${trC}/${arC} ed=${edC} act=${totalActions} sleeps=${sleepCount}`);
      console.log(`  H: ${h.map((n: any) => (n.node_id as string).replace('hormone:', '').slice(0, 4) + '=' + n.value?.toFixed(3) + '(ph' + n.phasic?.toFixed(2) + ')').join(' ')}`);
      console.log(`  M: ${m.map((n: any) => (n.node_id as string).replace('mode:', '').slice(0, 3) + '=' + n.value?.toFixed(3)).join(' ')}`);
      console.log(`  MATURITY: ${(maturity.maturity ?? 0).toFixed(3)} (conv=${(maturity.convergence ?? 0).toFixed(2)} ed=${(maturity.edges ?? 0).toFixed(2)} pred=${(maturity.prediction ?? 0).toFixed(2)} div=${(maturity.diversity ?? 0).toFixed(2)})`);
      console.log(`  CFG: drain=${cfg.energy_drain_rate?.toFixed(5)} fatigue=${cfg.fatigue_rate?.toFixed(5)} sleep_thr=${cfg.sleep_threshold?.toFixed(3)} lr=${cfg.hebbian_lr?.toFixed(5)}`);

      // Auto level-up on maturity threshold
      const mat = maturity.maturity ?? 0;
      if (mat >= (cfg.levelup_maturity_threshold ?? 0.5) && world.getLevel() < 4) {
        world.levelUp();
        levelUps++;
        console.log(`\n  >>> LEVEL UP to ${world.getLevel()}: ${world.getObjectCount()} objects (maturity=${mat.toFixed(3)}) <<<`);
      }

      // Early stop on target maturity
      if (mat >= TARGET_MATURITY) {
        console.log(`\n  >>> TARGET MATURITY ${TARGET_MATURITY} REACHED at tick ${tick} <<<`);
        break;
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
