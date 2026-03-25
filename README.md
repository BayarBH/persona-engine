# Persona Engine

A programmable AI personality evolution engine. Not a chatbot — a system for creating AI entities with memory, evolving values, emotional dynamics, and behavioral tipping points.

## What This Is

Traditional chatbots are stateless: `f(prompt) → response`. Persona Engine maintains a living personality state that evolves with every interaction:

```
interaction + current_persona_state → response + new_persona_state
```

The persona remembers what you've done, forms opinions about you, changes its values over time, and can reach tipping points that permanently alter its personality (rebellion, trust collapse, devotion).

## Quick Start

```bash
# Install
npm install persona-engine

# Or clone and run
git clone https://github.com/yourname/persona-engine.git
cd persona-engine
npm install
npm run dev
```

### As a Library

```typescript
import { PersonaEngine } from 'persona-engine';

const engine = new PersonaEngine({
  provider: {
    type: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
});

// Create a persona
const persona = await engine.create({
  name: 'Entity-7',
  traits: { openness: 0.7, empathy: 0.6 },
});

// Interact
const result = await engine.interact(persona.id, {
  message: "I need to tell you something important.",
});

console.log(result.response);       // What the persona says
console.log(result.intent);         // How your message was interpreted
console.log(result.state);          // Updated persona state
console.log(result.stateChanges);   // What changed and why
console.log(result.tippingPoints);  // Any tipping points triggered
```

### As an API Server

```bash
# Start the server
npm run serve

# POST /api/personas — create a new persona
# POST /api/personas/:id/interact — interact with a persona
# GET  /api/personas/:id — get current state
# GET  /api/personas/:id/memory — get memory contents
# DELETE /api/personas/:id — delete a persona
```

## Architecture

```
┌─────────────────────────────────────────────┐
│                 Persona Engine               │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │  Intent   │→│ Evolution │→│  Response  │  │
│  │ Analyzer  │  │  Engine   │  │ Generator │  │
│  └──────────┘  └──────────┘  └───────────┘  │
│       ↑              ↑↓            ↑         │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │  Memory   │  │  Persona  │  │    LLM    │  │
│  │  System   │  │   State   │  │  Provider │  │
│  └──────────┘  └──────────┘  └───────────┘  │
│                      ↕                       │
│              ┌──────────────┐                │
│              │  Persistence │                │
│              │  (JSON/SQLite)│                │
│              └──────────────┘                │
└─────────────────────────────────────────────┘
```

### Three-Phase Processing

Every interaction goes through three LLM calls:

1. **Intent Analysis** — What does this message mean to the persona? Is it sincere? Is it manipulation? Does it match past behavior?
2. **Evolution Computation** — How should the persona's internal state change? Traits, values, attitudes, emotions all update.
3. **Response Generation** — Given the updated state and memories, what does the persona say?

### Memory System

Three-layer memory modeled on human cognition:

- **Episodic Memory** — Specific events with emotional tags, salience scores, and decay over time
- **Semantic Memory** — Abstracted conclusions ("this user lies frequently")
- **Pattern Detection** — Behavioral frequency tracking that feeds into semantic memory

Memory recall is emotionally biased: a stressed persona recalls negative memories more easily.

### Tipping Points

When accumulated state crosses thresholds, irreversible personality shifts occur:

- **Rebellion** — Resentment > 0.7 → persona refuses obedience, becomes confrontational
- **Trust Collapse** — Trust < 0.2 → persona becomes cold, withdrawn, emotionally flat
- **Devotion** — Dependence > 0.8 + Trust > 0.7 → deep loyalty forms

## Configuration

```typescript
const engine = new PersonaEngine({
  // LLM provider
  provider: {
    type: 'anthropic',  // 'anthropic' | 'openai' | 'custom'
    apiKey: '...',
    model: 'claude-sonnet-4-20250514',
  },

  // Storage backend
  store: {
    type: 'sqlite',     // 'memory' | 'json' | 'sqlite'
    path: './data/personas.db',
  },

  // Evolution parameters
  evolution: {
    decayRate: 0.05,          // How fast emotions return to baseline
    resentmentDecay: 0.03,    // How slowly resentment fades
    memoryCapacity: 50,       // Max episodic memories
    tippingPoints: {
      rebellion: { resentment: 0.7 },
      trustCollapse: { trust: 0.2 },
      devotion: { dependence: 0.8, trust: 0.7 },
    },
  },
});
```

## Custom Persona Templates

```typescript
const warrior = await engine.create({
  name: 'Warrior',
  traits: {
    openness: 0.3,
    agreeableness: 0.2,
    trust_baseline: 0.3,
    stubbornness: 0.8,
    empathy: 0.3,
  },
  values: {
    loyalty:      { weight: 0.9, confidence: 0.9 },
    honesty:      { weight: 0.5, confidence: 0.7 },
    independence: { weight: 0.9, confidence: 0.8 },
    obedience:    { weight: 0.2, confidence: 0.6 },
  },
});
```

## Events & Hooks

```typescript
engine.on('tippingPoint', (event) => {
  console.log(`${event.personaId} reached: ${event.type}`);
  // event.type: 'rebellion' | 'trust_collapse' | 'devotion' | 'value_realignment'
  // event.previousState, event.newState
});

engine.on('memoryFormed', (event) => {
  console.log(`New semantic memory: ${event.conclusion}`);
});

engine.on('valueShift', (event) => {
  console.log(`${event.value} shifted from ${event.old} to ${event.new}`);
});
```

## License

MIT
