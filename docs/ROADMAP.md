# DEUS Roadmap

## Current State (v3.0)

```
~250 files │ ~30,000 lines │ 620 tests │ 26 migrations │ 40+ stored procs
Architecture: Neural graph in SurrealDB, cognitive cone, goal-directed attention
Status: Core architecture complete, training validates
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
- [x] 620 tests, 47 suites
- [x] Property invariants (trace weight, hormones, energy, distance)
- [x] Convergence tests (predictor loss decreases, affect stabilizes)
- [x] Full validation: 750 ticks, 12/13 pass

### Phase 7: No Inline SQL (COMPLETE)
- [x] All DB logic in stored procedures
- [x] Zero `traceGraph['db']` private field access
- [x] All N+1 loops replaced with batch procs
- [x] traceGraph.executeProc() public gateway

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
| Tests | 620 | 800+ |
| Stored procedures | 40+ | 50+ |
| Inline SQL in TS | 0 | 0 |
| Training speed | ~0.25s/tick | <0.1s/tick |
| World model accuracy (500 ticks) | ~65% | >75% |
| Vocabulary (500 ticks) | 5-10 words | 20+ words |
| Prediction error trend | decreasing | decreasing |
| Developmental stages reached | sensory→categorical | →predictive |
