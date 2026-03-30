# Training the Child

## Evolving World (5 levels)

The world IS the teacher. No separate adult module.

### Level Progression

| Level | Locations | Objects | Mama | Hidden States | Novelty |
|-------|-----------|---------|------|---------------|---------|
| 0 | 1 room | 5 | always | basic | none |
| 1 | 2 rooms | 10 | 80% | weight, temp | none |
| 2 | 3 rooms | 15 | 60% | + fragility | weather |
| 3 | 5 rooms | 20 | 30% | + edibility | social chars |
| 4 | all | 25+ | 15% | all | novel objects 3% |

Progression triggered by developmental metrics (not tick count).

### Object Properties

**Observable** (directly in events):
- shape, color, size, texture, physics, sound

**Hidden** (only observable via consequences):
- **weight**: "Не получается поднять" / "Тонет в воде" / "Легко поднять!"
- **temperature**: "Ой, холодное!" / "Тёплое и приятное" / "Палец прилипает!"
- **fragility**: "Разбилось!" / "Порвалось!" / "Тает в руках!"
- **edibility**: "Вкусно!" / "Мммм, можно кушать"

20% chance per interaction to reveal a hidden consequence. Agent must INFER the property from observed effects.

### Learning Signals

1. **Prediction error**: push ball → rolls (confirmed) vs push cube → doesn't (error)
2. **Reward shaping**: correct cluster structure → ambient reward
3. **Adversarial curriculum**: weak clusters get more exposure
4. **Mama teaching** (by level): naming → describing → cause-effect → questions → abstract

### Consequence-Based Learning

Agent never sees "тяжёлый" directly. It sees:
- "Камень. Толкнул камень. Не получается поднять." (consequence of weight)
- "Камень. Положил в воду. Тонет в воде." (another consequence)

From multiple consequences → agent should form concept "heavy objects sink AND can't be lifted".

## Training Scripts

### childhood.ts (main training)
- `CorrectiveWorldBridge`: amplified consequences, reward shaping
- `pump()` loop with `pushEvent(content, type, source)`
- Developmental metrics every 50 ticks
- Sleep when energy < 0.2 → fn::sleep_consolidation

### full-validation.ts (750 ticks)
- 500 physical + 250 social ticks
- 12/13 assertions: traces grow, dimensions capped, accuracy >50%, affect alive, energy spent

### multi-world.ts
- Physical → Social world transfer
- Same kernel, different WorldBridge
- Concept space carries over

## Developmental Metrics (6 domains)

Tracked every 50 ticks during training:

1. **Cognitive**: dimension growth, abstractions, schema complexity, coverage, retention
2. **Vitality**: sleep regularity, energy efficiency, fatigue resilience
3. **Affect**: valence trend, cortisol baseline, curiosity sustain, mode diversity
4. **Agency**: action diversity, explore→exploit shift, consequence learning
5. **World Model**: object coverage, accuracy, prediction precision, causal understanding
6. **Neural Graph**: total nodes/edges/updates, dead edges, mean weight, per-model stats

### Developmental Stages

sensory → categorical → predictive → agentic → reflective

Stage detection: weighted score across all domains, highest wins with progression bonus.
