/**
 * Multi-Session Training: train → pause (consolidation) → train → verify retention.
 *
 * Session 1: 40K world ticks, level 0 (5 objects)
 * Pause: 100K brain ticks (no world input — consolidation/sleep)
 * Session 2: 40K world ticks, level 0 (same objects) — is learning faster?
 * Pause: 100K brain ticks
 * Session 3: 40K world ticks, level 1 (8 objects) — transfer learning
 *
 * Between sessions: measure clustering, edges, hormones, reactivation patterns.
 */

import { Surreal } from 'surrealdb';
import { PhysicsWorld, SensoryTransition } from './physics-world';

const TICKS_PER_SESSION = parseInt(process.argv[2] || '40000', 10);
const PAUSE_TICKS = parseInt(process.argv[3] || '100000', 10);
const NUM_SESSIONS = 3;

async function main() {
  const db = new Surreal();
  await db.connect('ws://127.0.0.1:8000/rpc');
  await db.signin({ username: 'root', password: 'root' });
  await db.use({ namespace: 'deus', database: 'runtime' });

  await db.query('DEFINE TABLE OVERWRITE kernel_request SCHEMALESS');
  await db.query('DEFINE TABLE OVERWRITE brain_action SCHEMALESS');
  await db.query('DEFINE TABLE OVERWRITE activates SCHEMALESS TYPE RELATION FROM trace TO trace');

  // Kill conflicting events
  for (const ev of [
    'kernel_heartbeat ON kernel_state', 'critical_loop ON sched_critical',
    'high_loop ON sched_high', 'medium_loop ON sched_medium', 'low_loop ON sched_low',
    'kernel_wake ON kernel_event', 'cognitive_spread ON trace', 'cognitive_archive ON trace',
    'cognitive_hebbian ON activates', 'cognitive_backprop ON commit_log', 'nn_hebbian ON nn_edge',
  ]) { try { await db.query('REMOVE EVENT IF EXISTS ' + ev); } catch {} }

  await db.query('UPDATE kernel_state SET cycle = 0, energy = 1.0, fatigue = 0.0, running = true');

  const world = new PhysicsWorld();
  console.log(`Multi-session training: ${NUM_SESSIONS} sessions × ${TICKS_PER_SESSION} ticks, ${PAUSE_TICKS} pause ticks\n`);

  async function feedTransition(t: SensoryTransition) {
    await db.query(
      'RETURN fn::process_sensory($action_id, $channels, $speech, $valence, $object_idx)',
      { action_id: t.action_id, channels: t.channels, speech: t.speech, valence: t.valence, object_idx: t.object_idx },
    );
  }

  async function snapshot(label: string) {
    const traces = await db.query('SELECT count() AS c FROM trace WHERE archived = false GROUP ALL') as any;
    const archived = await db.query('SELECT count() AS c FROM trace WHERE archived = true GROUP ALL') as any;
    const edges = await db.query('SELECT count() AS c FROM activates GROUP ALL') as any;
    const hormones = await db.query('SELECT node_id, value FROM nn_node WHERE model = \'affect\' AND layer = \'hidden\'') as any;
    const accs = await db.query('SELECT node_id, value FROM nn_node WHERE model = \'affect\' AND layer = \'input\'') as any;
    const nnStats = await db.query('SELECT math::mean(math::abs(weight)) AS w, math::mean(update_count) AS u FROM nn_edge GROUP ALL') as any;
    const status = await db.query('RETURN fn::run_parallel_status()') as any;
    const actions = await db.query('SELECT count() AS c FROM brain_action GROUP ALL') as any;

    // Clustering: push-trace distances
    const pushTraces = await db.query('SELECT content, position FROM trace WHERE archived = false AND string::starts_with(content, \'1:\')') as any;
    const pushList = Array.isArray(pushTraces[0]) ? pushTraces[0] : [];

    const s = status[0] || {};
    const horms = Array.isArray(hormones[0]) ? hormones[0] : [];
    const accumList = Array.isArray(accs[0]) ? accs[0] : [];
    const es = nnStats[0]?.[0] ?? nnStats[0] ?? {};

    console.log(`\n=== ${label} ===`);
    console.log(`  Cycle: ${s?.cycle ?? '?'} | Energy: ${(s?.energy ?? 0).toFixed?.(3)} | Fatigue: ${(s?.fatigue ?? 0).toFixed?.(3)}`);
    console.log(`  Traces: ${traces[0]?.[0]?.c ?? traces[0]?.c ?? '?'} active, ${archived[0]?.[0]?.c ?? archived[0]?.c ?? 0} archived`);
    console.log(`  Edges: ${edges[0]?.[0]?.c ?? edges[0]?.c ?? 0} | Actions: ${actions[0]?.[0]?.c ?? actions[0]?.c ?? 0}`);
    console.log(`  Neural: |w|=${(es.w ?? 0).toFixed?.(4)} updates=${(es.u ?? 0).toFixed?.(0)}`);
    console.log(`  Hormones: ${horms.map((h: any) => `${h.node_id.replace('hormone:', '')}=${h.value?.toFixed(3)}`).join(' ')}`);
    console.log(`  Accumulators: ${accumList.map((a: any) => `${a.node_id.replace('acc:', '')}=${a.value?.toFixed(3)}`).join(' ')}`);

    // Clustering quality
    if (pushList.length >= 2) {
      const dists: number[] = [];
      for (let i = 0; i < pushList.length; i++) {
        for (let j = i + 1; j < pushList.length; j++) {
          const pa = pushList[i].position || [];
          const pb = pushList[j].position || [];
          let d = 0;
          for (let k = 0; k < Math.min(pa.length, pb.length, 13); k++) d += ((pa[k] ?? 0) - (pb[k] ?? 0)) ** 2;
          dists.push(Math.sqrt(d));
        }
      }
      dists.sort((a, b) => a - b);
      console.log(`  Push-clustering: min=${dists[0]?.toFixed(3)} median=${dists[Math.floor(dists.length / 2)]?.toFixed(3)} max=${dists[dists.length - 1]?.toFixed(3)}`);
    }

    // Top reactivated traces
    const topReact = await db.query('SELECT content, weight, reactivation_count FROM trace WHERE archived = false LIMIT 5') as any;
    const tops = Array.isArray(topReact[0]) ? topReact[0] : [];
    const meanReact = tops.length > 0 ? tops.reduce((s: number, t: any) => s + (t.reactivation_count ?? 0), 0) / tops.length : 0;
    const meanWeight = tops.length > 0 ? tops.reduce((s: number, t: any) => s + (t.weight ?? 0), 0) / tops.length : 0;
    console.log(`  Mean reactivation: ${meanReact.toFixed(1)} | Mean weight: ${meanWeight.toFixed(3)}`);
  }

  const totalT0 = Date.now();

  for (let session = 0; session < NUM_SESSIONS; session++) {
    const sessionT0 = Date.now();

    // Level up on session 3
    if (session === 2) {
      world.levelUp();
      console.log(`\n>>> LEVEL UP to ${world.getLevel()}: ${world.getObjectCount()} objects <<<`);
    }

    console.log(`\n────── SESSION ${session + 1} (${TICKS_PER_SESSION} world ticks) ──────`);

    let actionCount = 0;
    for (let tick = 0; tick < TICKS_PER_SESSION; tick++) {
      // World ambient
      const ambient = world.tick();
      for (const t of ambient) await feedTransition(t);

      // Brain thinks
      await db.query('RETURN fn::brain_tick(100)');

      // Process action requests
      const requests = await db.query(
        'SELECT * FROM kernel_request WHERE type = \'action\' AND status = \'pending\' LIMIT 5',
      ) as any;
      const reqs = Array.isArray(requests[0]) ? requests[0] : [];
      for (const req of reqs) {
        const action_id = Math.floor(Math.random() * 6);
        const consequence = world.act(action_id);
        actionCount++;
        await feedTransition(consequence);

        // Three-factor edge learning
        // Prediction error = inverse of familiarity (reactivation_count)
        // Novel traces → high pred_error → stronger learning signal
        const consKey = `${consequence.action_id}:${consequence.object_idx}`;
        try {
          await db.query(
            `LET $to = (SELECT * FROM trace WHERE content = $key AND archived = false LIMIT 1)[0];
             IF $to != NONE AND $to.id != NONE {
               LET $pred_error = 1.0 / (1.0 + ($to.reactivation_count ?? 0));
               LET $recent = (SELECT id FROM trace WHERE archived = false AND id != $to.id LIMIT 3);
               FOR $r IN $recent { fn::learn_edge($r.id, $to.id, $valence, $pred_error); };
             }`,
            { key: consKey, valence: consequence.valence },
          );
        } catch {}

        // Mode learning: reinforce current behavioral mode based on action outcome
        if (Math.abs(consequence.valence) > 0.01) {
          try { await db.query('RETURN fn::mode_learn($v)', { v: consequence.valence }); } catch {}
        }

        if (req.id) await db.query('UPDATE $id SET status = \'completed\'', { id: req.id });
      }

      // Progress report
      if (tick % Math.max(1, Math.floor(TICKS_PER_SESSION / 10)) === 0 && tick > 0) {
        const elapsed = (Date.now() - sessionT0) / 1000;
        const status = await db.query('RETURN fn::run_parallel_status()') as any;
        const s = status[0] || {};
        const traceQ = await db.query('SELECT count() AS c FROM trace WHERE archived = false GROUP ALL') as any;
        console.log(
          `  tick=${tick}/${TICKS_PER_SESSION}` +
          ` cycle=${s?.cycle ?? '?'}` +
          ` energy=${(s?.energy ?? 0).toFixed?.(2)}` +
          ` traces=${traceQ[0]?.[0]?.c ?? traceQ[0]?.c ?? '?'}` +
          ` actions=${actionCount}` +
          ` (${elapsed.toFixed(0)}s)`,
        );
      }
    }

    await snapshot(`AFTER SESSION ${session + 1}`);

    // PAUSE: brain consolidates (no world input)
    if (session < NUM_SESSIONS - 1) {
      console.log(`\n────── PAUSE: ${PAUSE_TICKS} brain ticks (consolidation) ──────`);
      const pauseT0 = Date.now();

      // Run brain without world input — consolidation, sleep, introspection
      const chunkSize = 10000;
      for (let i = 0; i < PAUSE_TICKS; i += chunkSize) {
        const batch = Math.min(chunkSize, PAUSE_TICKS - i);
        await db.query(`RETURN fn::brain_tick(${batch})`);
      }

      const pauseElapsed = (Date.now() - pauseT0) / 1000;
      console.log(`  Pause completed in ${pauseElapsed.toFixed(1)}s`);
      await snapshot(`AFTER PAUSE ${session + 1}`);
    }
  }

  const totalElapsed = (Date.now() - totalT0) / 1000;
  console.log(`\n═══════════════════════════════════════════`);
  console.log(`TOTAL TIME: ${totalElapsed.toFixed(1)}s`);
  console.log(`═══════════════════════════════════════════`);

  await db.query('UPDATE kernel_state SET running = false');
  await db.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message || e); process.exit(1); });
