import { createInterface } from 'readline';
import { PersonaEngine } from '../src/index.js';

async function main() {
  const engine = new PersonaEngine({
    provider: {
      type: 'anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY,
    },
    store: { type: 'json', path: './data' },
  });

  engine.on('tippingPoint', (event) => {
    console.log(`\n${'═'.repeat(50)}`);
    console.log(`⚡ 临界点: ${event.data.tippingPoint}`);
    console.log(`${'═'.repeat(50)}\n`);
  });

  // Create or resume
  const personas = await engine.list();
  let persona;

  if (personas.length > 0) {
    console.log('\n已有人格:');
    personas.forEach((p, i) => console.log(`  ${i + 1}. ${p.name} (交互 #${p.age})`));
    console.log(`  ${personas.length + 1}. 创建新人格\n`);

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const choice = await new Promise<string>(res => rl.question('选择: ', res));
    rl.close();

    const idx = parseInt(choice) - 1;
    if (idx >= 0 && idx < personas.length) {
      persona = await engine.get(personas[idx].id);
      console.log(`\n继续与 ${persona!.name} 对话 (交互 #${persona!.age})\n`);
    }
  }

  if (!persona) {
    persona = await engine.create({ name: 'Entity-7' });
    console.log(`\n创建了新人格: ${persona.name}\n`);
  }

  const personaId = persona.id;

  // Chat loop
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\n👤 > ',
  });

  console.log('输入消息与人格交互 (输入 /state 查看状态, /memory 查看记忆, /quit 退出)\n');
  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    if (input === '/quit') {
      console.log('\n再见。\n');
      process.exit(0);
    }

    if (input === '/state') {
      const s = await engine.get(personaId);
      if (!s) { rl.prompt(); return; }
      console.log('\n── 人格状态 ──');
      console.log(`交互次数: ${s.age}`);
      console.log(`信任: ${(s.attitude_toward_user.trust * 100).toFixed(0)}%  尊重: ${(s.attitude_toward_user.respect * 100).toFixed(0)}%  依赖: ${(s.attitude_toward_user.dependence * 100).toFixed(0)}%  怨恨: ${(s.attitude_toward_user.resentment * 100).toFixed(0)}%`);
      console.log(`情绪: ${(s.emotional_state.mood * 100).toFixed(0)}%  压力: ${(s.emotional_state.stress * 100).toFixed(0)}%`);
      console.log(`临界点: ${s.tipping_points_reached.length > 0 ? s.tipping_points_reached.join(', ') : '无'}`);
      rl.prompt();
      return;
    }

    if (input === '/memory') {
      const mem = await engine.getMemory(personaId);
      if (!mem) { console.log('无记忆'); rl.prompt(); return; }
      console.log('\n── 记忆 ──');
      console.log(`事件: ${mem.episodic.length}`);
      if (mem.semantic.length > 0) {
        console.log('认知:');
        mem.semantic.forEach(s => console.log(`  · ${s.conclusion} (${(s.confidence * 100).toFixed(0)}%)`));
      }
      if (Object.keys(mem.patterns).length > 0) {
        console.log('模式:', mem.patterns);
      }
      rl.prompt();
      return;
    }

    try {
      process.stdout.write('\n思考中...');
      const result = await engine.interact(personaId, { message: input });
      process.stdout.write('\r' + ' '.repeat(20) + '\r');

      console.log(`\n🤖 ${persona!.name}: ${result.response}`);
      console.log(`   [${result.intent.intent_type} | 信任 ${(result.state.attitude_toward_user.trust * 100).toFixed(0)}% | 情绪 ${(result.state.emotional_state.mood * 100).toFixed(0)}%]`);

      if (result.evolution.reasoning) {
        console.log(`   ↳ ${result.evolution.reasoning}`);
      }
    } catch (e: any) {
      console.error('\n错误:', e.message);
    }

    rl.prompt();
  });
}

main().catch(console.error);
