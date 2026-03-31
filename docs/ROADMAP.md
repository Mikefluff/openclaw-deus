# DEUS Roadmap

## Current State (v3.0)

```
~240 files │ ~27,000 lines │ 463 tests │ 34 migrations │ 55+ stored procs
Brain: autonomous in SurrealDB, three-factor Hebbian, sensorimotor interface
Training: hormones move (0.5→0.978), 107 edges, traces cluster by physics, 24K+ tps
```

## What's Done

### Phase 1: Core Architecture (COMPLETE)
- [x] Kernel loop with cognitive cone (depth/spread, not time)
- [x] 5-agent swarm (sensory, predictive, affective, priority, strategic)
- [x] Commit kernel with 6 typed commits
- [x] Concept space with emergent dimensions
- [x] Trace graph with Hebbian learning + spreading activation
- [x] Energy system with sleep/fatigue
- [x] LightCone multi-frequency processing (FAST→DEEP)

### Phase 2: Learning in DB (COMPLETE)
- [x] Neural networks as graph relations (nn_node + nn_edge)
- [x] 3 models in graph: affect (68 edges), cone (18 edges), predictor (128 edges)
- [x] fn::nn_forward/backward/softmax/decay/sprout stored procs
- [x] Reactive events: nn_hebbian, cognitive_spread, backprop (all ASYNC RETRY)
- [x] COMPUTED fields: nn_edge.importance, trace.effective_strength
- [x] Sleep consolidation: fn::sleep_consolidation (one proc, zero JS)
- [x] All batch operations: fn::batch_insert_transitions, batch_update_edges, etc.

### Phase 3: SurrealDB 3.0 Features (COMPLETE)
- [x] HNSW vector indexes (replaced MTREE)
- [x] Native vector::distance::euclidean() / vector::similarity::cosine()
- [x] Recursive graph traversal (->edge.{3}->trace)
- [x] ASYNC events with RETRY 3 MAXDEPTH 5
- [x] CONCURRENTLY index building
- [x] COUNT indexes for fast aggregation
- [x] DEFINE SEQUENCE for monotonic IDs
- [x] Closures in stored procs (.map(), .filter())

### Phase 4: Goal-Directed Attention (COMPLETE)
- [x] IntentionService wired into kernel loop
- [x] Active intention boosts cognitive cone depth
- [x] Goal-relevant commits get deeper spreading activation
- [x] Agents receive active_intention in context

### Phase 5: Partial Observability (COMPLETE)
- [x] Hidden object properties (weight, temperature, fragility, edibility)
- [x] Consequence-based revelation (20% chance per interaction)
- [x] Agent must INFER hidden states from observable effects
- [x] 5-level curriculum with progressive complexity

### Phase 6: Tests & Validation (COMPLETE)
- [x] 463 tests, 38 suites (removed useless mock-verification tests)
- [x] Property invariants (trace weight, hormones, energy, distance)
- [x] Convergence tests (predictor loss decreases, affect stabilizes)
- [x] fn::kernel_tick + fn::nn_forward verified on SurrealDB 3.0.4

### Phase 7: No Inline SQL (COMPLETE)
- [x] All DB logic in stored procedures
- [x] All N+1 loops replaced with batch procs
- [x] traceGraph.executeProc() public gateway

### Phase 8: Kernel Lives in SurrealDB (COMPLETE)
- [x] fn::kernel_tick() — full cognitive cycle in one stored proc
- [x] kernel_state, kernel_request, kernel_event tables
- [x] fn::kernel_spend(), fn::kernel_sleep(), fn::kernel_get_state()
- [x] NestJS tick() calls fn::kernel_tick(), zero orchestration in JS

### Phase 9: Flat NestJS (COMPLETE)
- [x] All modules @Global with imports: [], zero circular deps
- [x] CognitiveConfigService extracted to own @Global module
- [x] TraceGraphService rewritten: thin DB wrapper, no forwardRef
- [x] NestJS boot: 12ms (was: infinite hang from circular deps)
- [x] Deleted 8 useless mock-verification test files (-3504 lines)

### Phase 10: Preemptive Scheduler + Runtime Model (COMPLETE)
- [x] 4 priority circuits: CRITICAL/HIGH/MEDIUM/LOW
- [x] Preemptive scheduling with budget accounting
- [x] fn::interrupt(), fn::check_preemption() — 13 interrupt types
- [x] 3 reset classes: soft/safe_mode/hard
- [x] Formal runtime model (docs/RUNTIME-MODEL.md)
- [x] Personality = scheduler policy (budget ratios)

### Phase 11: Autonomous Agency + Training (COMPLETE)
- [x] fn::agency_tick — brain decides actions from affect (dopamine/cortisol)
- [x] fn::brain_tick — unified internal loop, all circuits at natural frequencies
- [x] Archive never delete (Pointer Architecture)
- [x] 1M+ cognitive ops in 45s (24K+ tps)

### Phase 12: Sensorimotor Interface (COMPLETE)
- [x] PhysicsWorld: 12 objects with mass/hardness/friction/roundness/fragility/etc.
- [x] 13 sensory channels: position_delta[3], rotation, force, sound, surface, temp, breakage, visual
- [x] 16 speech channels: Cyrillic character codes (mama speech)
- [x] fn::process_sensory — brain receives 29 numbers, never text
- [x] Traces position = sensory vector (64-dim padded for HNSW)
- [x] Push-trace clustering confirmed: similar physics = closer in concept space

### Phase 13: Three-Factor Learning (COMPLETE)
- [x] fn::learn_edge: Δw = η × eligibility × M (Frémaux & Gerstner 2016)
  M = dopamine × TD_error + (1-dopamine) × surprise
- [x] Eligibility traces on activates edges (temporal credit assignment)
- [x] fn::nn_backward: correct tanh derivative (1-x²)
- [x] SurrealDB #6382 workaround: LET binding for ?? precedence bug
- [x] Hormones: 0.5 → 0.978 (affect model learning!)
- [x] Edges: 0 → 107 (three-factor Hebbian creates associations)
- [x] Neural weights: 0.19 → 0.95 (updated 636×)

## What's Next

### Priority 1: Self Model Aggregation
- Self-model commits exist but aren't aggregated
- Need: `getIdentity()` → queryable trajectory of commit-policy
- Autobiography generation from self-model commit history
- Self metrics in developmental metrics

### Priority 2: Causal Constraints
- Past commits should CONSTRAIN future options
- "If you broke the glass, you can't drink from it"
- History changes action costs/availability
- Causal graph enforcement in agency decisions

### Priority 3: Dimension Death/Merge
- Dimensions only grow, never shrink
- Need: unused dimensions fade, similar dimensions merge
- Memory geometry becomes more efficient over time

### Priority 4: Language Emergence
- Lexical traces as source_type='lexical' in concept space
- 5-phase verbalization: babbling → one-word → two-word → telegraphic → grammar
- Cross-situational learning for word-concept binding
- No hardcoded vocabulary

### Priority 5: Multi-World Transfer
- Physical world → Social world transfer
- Concept space carries over between worlds
- Cluster-level trajectories generalize across domains

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Tests | 463 | 600+ (real integration tests) |
| Stored procedures | 45+ | 50+ |
| Inline SQL in TS | 0 | 0 |
| NestJS boot | 12ms | <50ms |
| fn::kernel_tick | verified | <10ms/tick |
| Circular deps | 0 | 0 |
| Training speed | ~0.25s/tick | <0.1s/tick |
| World model accuracy (500 ticks) | ~65% | >75% |
| Prediction error trend | decreasing | decreasing |
