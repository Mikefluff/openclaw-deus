# Training — Childhood in a Virtual World

## Approach

Not lessons. LIFE. The child lives in a virtual world with objects, physics, and a mama. The kernel decides everything — what to explore, when to rest, when to ask for help.

## Virtual World

5 locations, 30+ objects with full physics:

| Location | Objects |
|----------|---------|
| Детская | мячик, кубик, книжка, подушка, кукла, машинка, пирамидка |
| Кухня | тарелка, ложка, стакан, яблоко, хлеб, чашка |
| Двор | камень, палка, песок, лужа, листок, жук, цветок |
| Парк | дерево, скамейка, голубь, собака, качели, горка |
| Ванная | вода, мыло, полотенце, утка_резиновая, зеркало |

Each object has: shape, color, size, texture, physics, sound.

## Event Streams (per tick)

- **Object**: presence, visual properties
- **Touch**: tactile feedback
- **Physics**: consequences of actions (roll, break, float, sink)
- **Sound**: object sounds
- **Mama speech**: naming, describing, teaching, questioning
- **Mama emotion**: praise, correction, comfort
- **Ambient**: weather, time of day
- **Surprise**: unexpected events (cat jumps, phone rings)
- **Internal**: fatigue, energy state

## Energy Budget

Everything costs energy:
- LLM call: 0.08 (expensive — like asking an adult for help)
- New trace: 0.005 (perception)
- Exploration: 0.03 (active interaction with world)
- Reflection: 0.01 (idle thinking)

Low energy → sleep → consolidation → full recovery.

## Running

```bash
# 500 world ticks (~10-15 min with LLM)
npx ts-node src/training/childhood.ts 500

# 100 ticks quick test
npx ts-node src/training/childhood.ts 100
```

## Metrics Reported

Every 5%: traces, commits, dimensions, modalities, affect state, energy state, world model accuracy (concept space beliefs vs ground truth).
