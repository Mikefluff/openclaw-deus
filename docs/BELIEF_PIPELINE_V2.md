# Belief Processing Pipeline v2

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     BELIEF LIFECYCLE                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Observation → Extraction → Validation → Storage → Decay   │
│      │            │            │          │        │       │
│      │            │            │          │        │       │
│      ▼            ▼            ▼          ▼        ▼       │
│  Session    belief-      Contradiction  core    belief-   │
│  History    extractor.js   check      .jsonl    decay.js  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. Belief Decay (`scripts/belief-decay.js`)
**Frequency:** Daily at 00:00
**Purpose:** Prevent stale beliefs

```javascript
// Decay rates
axiom:     0.0   // No decay (I1-I5)
self:      0.0   // No decay (S1-S3)
external:  0.03  // 3% per day (M-beliefs)
inference: 0.05  // 5% per day (G-beliefs)
```

**Actions:**
- Apply exponential decay: `confidence(t) = confidence(0) × e^(-λ×Δt)`
- Flag beliefs below 0.7 for review
- Archive beliefs below 0.2
- Log all changes to `logs/belief-decay.log`

### 2. Belief Extractor (`scripts/belief-extractor.js`)
**Frequency:** 3× daily (08:00, 16:00, 00:00) + during introspection
**Purpose:** Learn from sessions without per-token overhead

**Optimization:** Instead of extracting after every conversation (token-heavy), batch process:
- Morning (08:00): Process overnight sessions
- Afternoon (16:00): Process daytime sessions
- Midnight (00:00): Process evening sessions + introspection

**Extracts:**
- Communication preferences ("do not use X", "I prefer Y")
- Workflow patterns ("I want", "I need", "this matters")
- Confidence based on signal strength

**Actions:**
- Scan memory files modified since last run
- Extract patterns using regex
- Create new beliefs or refresh existing
- Avoid duplicates via similarity matching

### 3. Contradiction Detector (`scripts/belief-contradictions.js`)
**Frequency:** During introspection
**Purpose:** Maintain coherence

**Detects:**
- Direct negations ("I like X" vs "I do not like X")
- Confidence divergence (>0.5 difference on similar topics)

**Actions:**
- Reduce confidence of both beliefs by 20%
- Flag as `review_needed`
- Log to `logs/contradictions.log`

### 4. Introspection Integration
**Frequency:** Daily at 21:00
**Purpose:** Comprehensive system check

**Runs:**
1. Belief extraction (catch any missed patterns)
2. Contradiction detection
3. Decay (if not run recently)
4. Coherence calculation
5. Report generation

## Belief Categories

| Prefix | Type | Example | Decay Rate |
|--------|------|---------|------------|
| I | Axiom (invariant) | Epistemic honesty | 0% |
| G | Goal | Support the human operator's flourishing | 5% |
| M | Memory/Observation | The human operator prefers structure | 3% |
| S | Self-model | I am DEUS | 0% |
| W | Workflow | Batch processing preferred | 5% |

## Token Optimization

### Before (v1):
```
Every session → Immediate extraction → High token cost
```

### After (v2):
```
Sessions → Memory files → Batch extraction 3×/day → Lower cost, same freshness
```

**Estimated savings:** ~60-70% reduction in extraction tokens

## Files

| File | Purpose |
|------|---------|
| `beliefs/core.jsonl` | Active beliefs |
| `logs/belief-decay.log` | Decay events |
| `logs/belief-extractor.log` | Extraction events |
| `logs/contradictions.log` | Contradiction alerts |
| `data/.last-extraction` | Extraction timestamp |

## Monitoring

Check system health:
```bash
npm run deus:beliefs:decay
npm run deus:beliefs:extract
npm run deus:beliefs:contradictions
```

View reports:
```bash
tail -f logs/belief-decay.log
tail -f logs/belief-extractor.log
ls docs/introspection/introspection-*.md
```

## Future Improvements

- [ ] Semantic similarity via embeddings (better than Jaccard)
- [ ] Confidence prediction model (ML-based)
- [ ] Belief visualization dashboard
- [ ] Automated hypothesis generation
- [ ] Cross-session pattern mining

## Last Updated

2026-03-03 — Pipeline v2 deployed
