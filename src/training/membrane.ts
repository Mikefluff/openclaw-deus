/**
 * Membrane: thin translator between brain (SurrealDB) and world (PhysicsWorld).
 *
 * Brain runs autonomously (fn::brain_tick). Membrane:
 * 1. World tick → ambient sensory transitions → fn::process_sensory (numbers only)
 * 2. Brain generates kernel_request type='action' → membrane executes in world
 * 3. World returns sensory consequence (13 channels + valence) → fn::process_sensory
 *
 * Brain sees ONLY numbers. Never text. Never object names.
 */

import Surreal from 'surrealdb';
import { PhysicsWorld, SensoryTransition } from './physics-world';

const TOTAL_TICKS = parseInt(process.argv[2] || '5000', 10);

async function main() {
  const db = new Surreal();
  await db.connect('http://127.0.0.1:8000/rpc', { versionCheck: false } as any);
  await db.signin({ username: 'root', password: 'root' });
  await db.use({ namespace: 'deus', database: 'runtime' });
  console.log('Membrane connected');

  // Fix tables
  await db.query('DEFINE TABLE OVERWRITE kernel_request SCHEMALESS');
  await db.query('DEFINE TABLE OVERWRITE brain_action SCHEMALESS');
  await db.query('DEFINE TABLE OVERWRITE activates SCHEMALESS TYPE RELATION FROM trace TO trace');

  // Kill conflicting events
  await db.query('UPDATE kernel_state SET running = false');
  await new Promise(r => setTimeout(r, 500));
  for (const ev of [
    'kernel_heartbeat ON kernel_state', 'critical_loop ON sched_critical',
    'high_loop ON sched_high', 'medium_loop ON sched_medium',
    'low_loop ON sched_low', 'kernel_wake ON kernel_event',
    'cognitive_spread ON trace', 'cognitive_archive ON trace',
    'cognitive_hebbian ON activates', 'cognitive_backprop ON commit_log',
    'nn_hebbian ON nn_edge',
  ]) {
    try { await db.query('REMOVE EVENT IF EXISTS ' + ev); } catch {}
  }
  await new Promise(r => setTimeout(r, 500));

  const world = new PhysicsWorld();
  console.log(`World: level ${world.getLevel()}, ${world.getObjectCount()} objects`);

  await db.query('UPDATE kernel_state SET cycle = 0, energy = 1.0, fatigue = 0.0, running = true');

  const t0 = Date.now();
  let actionCount = 0;

  console.log(`Training: ${TOTAL_TICKS} world ticks\n`);

  async function feedTransition(t: SensoryTransition) {
    await db.query(
      'RETURN fn::process_sensory($action_id, $channels, $speech, $valence, $object_idx)',
      { action_id: t.action_id, channels: t.channels, speech: t.speech, valence: t.valence, object_idx: t.object_idx },
    );
  }

  for (let tick = 0; tick < TOTAL_TICKS; tick++) {
    // 1. World ambient events → brain (numbers only)
    const ambient = world.tick();
    for (const t of ambient) {
      await feedTransition(t);
    }

    // 2. Brain thinks (1000 internal ticks)
    await db.query('RETURN fn::brain_tick(1000)');

    // 3. Brain's action requests → execute in world → feed consequence
    const requests = await db.query(
      'SELECT * FROM kernel_request WHERE type = \'action\' AND status = \'pending\' LIMIT 5',
    ) as any;
    const reqs = Array.isArray(requests[0]) ? requests[0] : [];

    for (const req of reqs) {
      const payload = req.payload || {};
      const method = typeof payload.method === 'string'
        ? ['touch', 'push', 'drop', 'shake', 'look', 'squeeze'].indexOf(payload.method)
        : Math.floor(Math.random() * 6);
      const action_id = method >= 0 ? method : Math.floor(Math.random() * 6);

      // Execute in physics world
      const consequence = world.act(action_id);
      actionCount++;

      // Feed numerical consequence to brain
      await feedTransition(consequence);

      // Mark processed
      if (req.id) await db.query('UPDATE $id SET status = \'completed\'', { id: req.id });
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

  // ═══════════════════════════════════════════
  // REPORT
  // ═══════════════════════════════════════════

  const elapsed = (Date.now() - t0) / 1000;
  const traces = await db.query('SELECT count() AS c FROM trace WHERE archived = false GROUP ALL') as any;
  const archived = await db.query('SELECT count() AS c FROM trace WHERE archived = true GROUP ALL') as any;
  const edges = await db.query('SELECT count() AS c FROM activates GROUP ALL') as any;
  const topTraces = await db.query('SELECT trace_id, content, weight, reactivation_count FROM trace WHERE archived = false LIMIT 10') as any;
  const hormones = await db.query('SELECT node_id, value FROM nn_node WHERE model = \'affect\' AND layer = \'hidden\'') as any;
  const accumulators = await db.query('SELECT node_id, value FROM nn_node WHERE model = \'affect\' AND layer = \'input\'') as any;
  const nnStats = await db.query('SELECT math::mean(math::abs(weight)) AS w, math::mean(update_count) AS u FROM nn_edge GROUP ALL') as any;
  const status = await db.query('RETURN fn::run_parallel_status()') as any;
  const s = status[0] || {};

  console.log('\n=== TRAINING COMPLETE ===');
  console.log(`Time: ${elapsed.toFixed(1)}s | World ticks: ${TOTAL_TICKS} | Brain cycles: ${s?.cycle ?? '?'}`);
  console.log(`Energy: ${(s?.energy ?? 0).toFixed?.(3)} | Fatigue: ${(s?.fatigue ?? 0).toFixed?.(3)}`);
  console.log(`Actions: ${actionCount} | World: ${JSON.stringify(world.getDebugInfo())}`);

  console.log('\n--- TRACES ---');
  console.log(`Active: ${traces[0]?.[0]?.c ?? traces[0]?.c ?? '?'} | Archived: ${archived[0]?.[0]?.c ?? archived[0]?.c ?? 0} | Edges: ${edges[0]?.[0]?.c ?? edges[0]?.c ?? 0}`);

  console.log('\n--- TOP TRACES (action:object patterns) ---');
  const tops = Array.isArray(topTraces[0]) ? topTraces[0] : topTraces;
  for (const t of (tops as any[]).slice(0, 8)) {
    console.log(`  w=${t.weight?.toFixed(3)} react=${t.reactivation_count} "${t.content}"`);
  }

  console.log('\n--- HORMONES ---');
  const horms = Array.isArray(hormones[0]) ? hormones[0] : hormones;
  for (const h of (horms as any[])) console.log(`  ${h.node_id}: ${h.value?.toFixed(4)}`);

  console.log('\n--- ACCUMULATORS ---');
  const accs = Array.isArray(accumulators[0]) ? accumulators[0] : accumulators;
  for (const a of (accs as any[])) console.log(`  ${a.node_id}: ${a.value?.toFixed(4)}`);

  console.log('\n--- NEURAL GRAPH ---');
  const es = nnStats[0]?.[0] ?? nnStats[0] ?? {};
  console.log(`  Mean |weight|: ${(es.w ?? 0).toFixed?.(4)} | Mean updates: ${(es.u ?? 0).toFixed?.(0)}`);

  // ═══════════════════════════════════════════
  // LEARNING METRICS — does brain ACTUALLY learn?
  // ═══════════════════════════════════════════

  console.log('\n--- LEARNING METRICS ---');

  // 1. Trace clustering: do similar objects cluster?
  // Push(мячик=0) and push(яблоко=8) should have similar positions (both roll)
  // Push(кубик=1) should be far from push(мячик=0) (doesn't roll)
  const pushTraces = await db.query('SELECT content, position FROM trace WHERE archived = false AND string::starts_with(content, \'1:\')') as any;
  const pushList = Array.isArray(pushTraces[0]) ? pushTraces[0] : pushTraces;
  if ((pushList as any[]).length >= 2) {
    // Compute distance between push-traces
    const dists: Array<{ a: string; b: string; dist: number }> = [];
    for (let i = 0; i < Math.min(pushList.length, 5); i++) {
      for (let j = i + 1; j < Math.min(pushList.length, 5); j++) {
        const pa = (pushList as any)[i].position || [];
        const pb = (pushList as any)[j].position || [];
        let d = 0;
        for (let k = 0; k < Math.min(pa.length, pb.length); k++) d += (pa[k] - pb[k]) ** 2;
        dists.push({ a: (pushList as any)[i].content, b: (pushList as any)[j].content, dist: Math.sqrt(d) });
      }
    }
    dists.sort((a, b) => a.dist - b.dist);
    console.log('  Push-trace distances (closer = similar physics):');
    for (const d of dists.slice(0, 5)) {
      console.log(`    ${d.a} ↔ ${d.b}: dist=${d.dist.toFixed(3)}`);
    }
  }

  // 2. Reactivation distribution: highly reactivated = well-learned
  const reactDist = await db.query('SELECT content, reactivation_count, weight FROM trace WHERE archived = false') as any;
  const reactList = Array.isArray(reactDist[0]) ? reactDist[0] : reactDist;
  if ((reactList as any[]).length > 0) {
    const reacts = (reactList as any[]).map((t: any) => t.reactivation_count ?? 0);
    const mean = reacts.reduce((s: number, r: number) => s + r, 0) / reacts.length;
    const max = Math.max(...reacts);
    const weights = (reactList as any[]).map((t: any) => t.weight ?? 0);
    const meanW = weights.reduce((s: number, w: number) => s + w, 0) / weights.length;
    console.log(`  Reactivation: mean=${mean.toFixed(1)} max=${max} (more = better learning)`);
    console.log(`  Mean trace weight: ${meanW.toFixed(3)} (higher = stronger memories)`);
  }

  // 3. Speech binding: mama traces linked to action traces?
  const speechTraces = await db.query('SELECT content, weight, reactivation_count FROM trace WHERE string::starts_with(content, \'-1:\') AND archived = false') as any;
  const speechList = Array.isArray(speechTraces[0]) ? speechTraces[0] : speechTraces;
  console.log(`  Speech traces: ${(speechList as any[]).length} (mama named ${(speechList as any[]).length} objects)`);
  for (const st of (speechList as any[]).slice(0, 5)) {
    console.log(`    "${st.content}" w=${st.weight?.toFixed(3)} react=${st.reactivation_count}`);
  }

  // 4. Accumulator balance: convergence should grow, novelty should decay
  const accFinal = Array.isArray(accumulators[0]) ? accumulators[0] : accumulators;
  const conv = (accFinal as any[]).find((a: any) => a.node_id === 'acc:convergence')?.value ?? 0;
  const nov = (accFinal as any[]).find((a: any) => a.node_id === 'acc:novelty')?.value ?? 0;
  const pred = (accFinal as any[]).find((a: any) => a.node_id === 'acc:pred_error')?.value ?? 0;
  console.log(`  Learning signal: convergence=${conv.toFixed(3)} novelty=${nov.toFixed(3)} pred_error=${pred.toFixed(3)}`);
  console.log(`  ${conv > nov ? 'CONVERGING (world becoming predictable)' : 'EXPLORING (still discovering)'}`);

  await db.query('UPDATE kernel_state SET running = false');
  await db.close();
  process.exit(0);
}

main().catch(e => { console.error('FATAL:', e.message || e); process.exit(1); });
