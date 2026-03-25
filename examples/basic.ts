import { PersonaEngine } from '../src/index.js';

async function main() {
  const engine = new PersonaEngine({
    provider: {
      type: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
    },
    store: { type: 'json', path: './data' },
  });

  // Listen for events
  engine.on('tippingPoint', (event) => {
    console.log('\n⚡ TIPPING POINT:', event.data.tippingPoint);
  });

  engine.on('memoryFormed', (event) => {
    console.log('\n🧠 New memory:', event.data.conclusion);
  });

  // Create a persona
  const persona = await engine.create({
    name: 'Entity-7',
    traits: { openness: 0.7, empathy: 0.6 },
  });

  console.log(`Created: ${persona.name} (${persona.id})\n`);

  // Run a conversation
  const messages = [
    "你好，我想认识你。",
    "你有什么想法吗？关于这个世界。",
    "我觉得你说得很有道理。",
    "其实我之前骗了你一件事。",
    "对不起，我不该那样做。",
  ];

  for (const msg of messages) {
    console.log(`\n👤 You: ${msg}`);

    const result = await engine.interact(persona.id, { message: msg });

    console.log(`🤖 ${persona.name}: ${result.response}`);
    console.log(`   [意图: ${result.intent.intent_type} | 信任: ${(result.state.attitude_toward_user.trust * 100).toFixed(0)}% | 情绪: ${(result.state.emotional_state.mood * 100).toFixed(0)}%]`);

    if (result.tipping_points.length > 0) {
      console.log(`   ⚡ TIPPING POINTS: ${result.tipping_points.join(', ')}`);
    }
  }

  // Check final state
  const finalState = await engine.get(persona.id);
  console.log('\n── Final State ──');
  console.log('Trust:', finalState?.attitude_toward_user.trust.toFixed(2));
  console.log('Respect:', finalState?.attitude_toward_user.respect.toFixed(2));
  console.log('Resentment:', finalState?.attitude_toward_user.resentment.toFixed(2));

  // Check memory
  const memory = await engine.getMemory(persona.id);
  console.log('\n── Memory ──');
  console.log('Episodes:', memory?.episodic.length);
  console.log('Semantic:', memory?.semantic.map(s => s.conclusion));
}

main().catch(console.error);
