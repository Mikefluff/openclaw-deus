/**
 * Membrane: thin layer between brain (SurrealDB) and world (EvolvingWorld).
 *
 * Brain runs autonomously via fn::brain_tick (all circuits inside one FOR loop).
 * Membrane:
 * 1. Feeds world ambient events → fn::process_consequence
 * 2. Brain generates kernel_request type='action' → membrane executes in world
 * 3. World consequences → fn::process_consequence → brain learns
 *
 * Brain is pure RL. Doesn't know object names. Just pokes things.
 */

import Surreal from 'surrealdb';
import { EvolvingWorld } from './evolving-world';

const TOTAL_TICKS = parseInt(process.argv[2] || '5000', 10);

async function main() {
  const db = new Surreal();
  await db.connect('http://127.0.0.1:8000/rpc', { versionCheck: false } as any);
  await db.signin({ username: 'root', password: 'root' });
  await db.use({ namespace: 'deus', database: 'runtime' });
  console.log('Membrane connected');

  // Fix tables + kill conflicting events from old migrations
  await db.query('DEFINE TABLE OVERWRITE kernel_request SCHEMALESS');
  await db.query('DEFINE TABLE OVERWRITE brain_action SCHEMALESS');
  await db.query('UPDATE kernel_state SET running = false');
  await new Promise(r => setTimeout(r, 500));
  for (const ev of [
    'kernel_heartbeat ON kernel_state',
    'critical_loop ON sched_critical',
    'high_loop ON sched_high',
    'medium_loop ON sched_medium',
    'low_loop ON sched_low',
    'kernel_wake ON kernel_event',
    'cognitive_spread ON trace',
    'cognitive_archive ON trace',
    'cognitive_hebbian ON activates',
    'cognitive_backprop ON commit_log',
    'nn_hebbian ON nn_edge',
  ]) {
    try { await db.query('REMOVE EVENT IF EXISTS ' + ev); } catch {}
  }
  await new Promise(r => setTimeout(r, 500));

  const world = new EvolvingWorld();
  console.log(`World: level ${world.getLevel()}, ${world.getObjectCount()} objects`);

  await db.query('UPDATE kernel_state SET cycle = 0, energy = 1.0, fatigue = 0.0, running = true');

  const t0 = Date.now();
  let actionCount = 0;
  let consequenceCount = 0;

  console.log(`Training: ${TOTAL_TICKS} world ticks\n`);

  for (let tick = 0; tick < TOTAL_TICKS; tick++) {
    // 1. World tick → ambient sensory events
    const events = world.tick();
    for (const event of events) {
      await db.query(
        `RETURN fn::process_consequence($content, $source, $valence)`,
        { content: event.content, source: event.source || 'ambient', valence: 0.0 },
      );
    }

    // 2. Brain thinks (1000 internal ticks per world tick)
    await db.query('RETURN fn::brain_tick(1000)');

    // 3. Process brain's action requests
    const requests = await db.query(
      `SELECT * FROM kernel_request WHERE type = 'action' AND status = 'pending' LIMIT 5`,
    ) as any;
    const reqs = Array.isArray(requests[0]) ? requests[0] : [];

    for (const req of reqs) {
      const payload = req.payload || {};
      const method = payload.method || 'touch';

      // Map brain's target to world object (brain doesn't know names)
      const objects = world.getObjects();
      const worldTarget = objects[Math.floor(Math.random() * objects.length)]?.nameRu || 'random';

      // Execute in world
      const consequences = world.childAction(method, worldTarget);
      actionCount++;

      // Feed consequences back to brain
      for (const c of consequences) {
        const valence = c.content.includes('!') ? 0.3 : c.content.includes('Ай') ? -0.5 : 0.0;
        await db.query(
          `RETURN fn::process_consequence($content, $source, $valence)`,
          { content: c.content, source: 'action_result', valence },
        );
        consequenceCount++;
      }

      // Mark processed
      if (req.id) await db.query(`UPDATE $id SET status = 'completed'`, { id: req.id });
    }

    // 4. Report
    if (tick % Math.max(1, Math.floor(TOTAL_TICKS / 20)) === 0) {
      const status = await db.query('RETURN fn::run_parallel_status()') as any;
      const s = status[0] || {};
      const traces = await db.query('SELECT count() AS c FROM trace WHERE archived = false GROUP ALL') as any;
      const traceCount = traces[0]?.[0]?.c ?? traces[0]?.c ?? 0;
      const elapsed = (Date.now() - t0) / 1000;

      console.log(
        `tick=${tick}/${TOTAL_TICKS}` +
        ` cycle=${s?.cycle ?? '?'}` +
        ` energy=${(s?.energy ?? 0).toFixed?.(2) ?? '?'}` +
        ` traces=${traceCount}` +
        ` actions=${actionCount}` +
        ` (${elapsed.toFixed(1)}s)`,
      );
    }
  }

  // Final report — deep learning metrics
  const elapsed = (Date.now() - t0) / 1000;
  const finalStatus = await db.query('RETURN fn::run_parallel_status()') as any;
  const traces = await db.query('SELECT count() AS c FROM trace WHERE archived = false GROUP ALL') as any;
  const archivedTraces = await db.query('SELECT count() AS c FROM trace WHERE archived = true GROUP ALL') as any;
  const wm = await db.query('RETURN fn::build_world_model()') as any;
  const intro = await db.query('RETURN fn::introspect()') as any;
  const totalActions = await db.query('SELECT count() AS c FROM brain_action GROUP ALL') as any;

  // Learning metrics: trace reactivation (dedup = learning same thing again)
  const highReact = await db.query('SELECT trace_id, content, weight, reactivation_count FROM trace WHERE reactivation_count > 3 AND archived = false ORDER BY reactivation_count DESC LIMIT 10') as any;
  const topTraces = await db.query('SELECT trace_id, content, weight, reactivation_count FROM trace WHERE archived = false ORDER BY weight DESC LIMIT 10') as any;

  // Neural graph state
  const hormones = await db.query('SELECT node_id, value FROM nn_node WHERE model = \'affect\' AND layer = \'hidden\'') as any;
  const accumulators = await db.query('SELECT node_id, value FROM nn_node WHERE model = \'affect\' AND layer = \'input\'') as any;

  // Edge stats (learning evidence)
  const nnEdgeStats = await db.query('SELECT math::mean(math::abs(weight)) AS mean_w, math::mean(update_count) AS mean_updates, math::mean(grad_acc) AS mean_grad FROM nn_edge GROUP ALL') as any;
  const traceEdges = await db.query('SELECT count() AS c FROM activates GROUP ALL') as any;

  // Action diversity
  const actionMethods = await db.query('SELECT method, count() AS c FROM brain_action GROUP BY method ORDER BY c DESC') as any;

  console.log('\n=== TRAINING COMPLETE ===');
  console.log(`Time: ${elapsed.toFixed(1)}s`);
  console.log(`World ticks: ${TOTAL_TICKS}`);
  console.log(`Brain cycles: ${finalStatus[0]?.cycle ?? '?'}`);
  console.log(`Energy: ${(finalStatus[0]?.energy ?? 0).toFixed?.(3) ?? '?'}`);
  console.log(`Fatigue: ${(finalStatus[0]?.fatigue ?? 0).toFixed?.(3) ?? '?'}`);

  console.log('\n--- TRACES ---');
  console.log(`Active: ${traces[0]?.[0]?.c ?? traces[0]?.c ?? '?'}`);
  console.log(`Archived: ${archivedTraces[0]?.[0]?.c ?? archivedTraces[0]?.c ?? 0}`);
  console.log(`Trace edges: ${traceEdges[0]?.[0]?.c ?? traceEdges[0]?.c ?? 0}`);

  console.log('\n--- MOST REACTIVATED (learning same thing = dedup working) ---');
  const reacts = Array.isArray(highReact[0]) ? highReact[0] : highReact;
  for (const t of (reacts as any[]).slice(0, 5)) {
    console.log(`  ${t.reactivation_count}× w=${t.weight?.toFixed(3)} "${(t.content || '').slice(0, 60)}"`);
  }

  console.log('\n--- STRONGEST TRACES (what brain remembers most) ---');
  const tops = Array.isArray(topTraces[0]) ? topTraces[0] : topTraces;
  for (const t of (tops as any[]).slice(0, 5)) {
    console.log(`  w=${t.weight?.toFixed(3)} react=${t.reactivation_count} "${(t.content || '').slice(0, 60)}"`);
  }

  console.log('\n--- AFFECT (hormones) ---');
  const horms = Array.isArray(hormones[0]) ? hormones[0] : hormones;
  for (const h of (horms as any[])) {
    console.log(`  ${h.node_id}: ${h.value?.toFixed(4)}`);
  }

  console.log('\n--- ACCUMULATORS ---');
  const accs = Array.isArray(accumulators[0]) ? accumulators[0] : accumulators;
  for (const a of (accs as any[])) {
    console.log(`  ${a.node_id}: ${a.value?.toFixed(4)}`);
  }

  console.log('\n--- NEURAL GRAPH ---');
  const es = nnEdgeStats[0]?.[0] ?? nnEdgeStats[0] ?? {};
  console.log(`  Mean |weight|: ${(es.mean_w ?? 0).toFixed?.(4) ?? '?'}`);
  console.log(`  Mean update_count: ${(es.mean_updates ?? 0).toFixed?.(1) ?? '?'}`);
  console.log(`  Mean grad_acc: ${(es.mean_grad ?? 0).toFixed?.(4) ?? '?'}`);

  console.log('\n--- ACTIONS ---');
  console.log(`Total: ${totalActions[0]?.[0]?.c ?? totalActions[0]?.c ?? actionCount}`);
  const methods = Array.isArray(actionMethods[0]) ? actionMethods[0] : actionMethods;
  for (const m of (methods as any[]).slice(0, 5)) {
    console.log(`  ${m.method}: ${m.c}`);
  }

  console.log('\n--- WORLD MODEL ---');
  console.log(`Confidence: ${(wm[0]?.confidence ?? 0).toFixed?.(3) ?? '?'}`);
  console.log(`Introspection: coherence=${(intro[0]?.coherence ?? 0).toFixed?.(3) ?? '?'} posture=${intro[0]?.posture ?? '?'}`);

  await db.query('UPDATE kernel_state SET running = false');
  await db.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message || e); process.exit(1); });
