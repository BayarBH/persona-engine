import express from 'express';
import { PersonaEngine } from './core/engine.js';

const app = express();
app.use(express.json());

const engine = new PersonaEngine({
  provider: {
    type: 'anthropic',
    apiKey: process.env.ANTHROPIC_API_KEY,
  },
  store: {
    type: process.env.STORE_TYPE as any || 'json',
    path: process.env.STORE_PATH || './data',
  },
});

// Log tipping points
engine.on('tippingPoint', (event) => {
  console.log(`⚡ TIPPING POINT: ${event.data.tippingPoint} for persona ${event.personaId}`);
});

// ─── Routes ───

// Create persona
app.post('/api/personas', async (req, res) => {
  try {
    const persona = await engine.create(req.body);
    res.status(201).json(persona);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// List personas
app.get('/api/personas', async (_req, res) => {
  try {
    const list = await engine.list();
    res.json(list);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get persona state
app.get('/api/personas/:id', async (req, res) => {
  try {
    const state = await engine.get(req.params.id);
    if (!state) return res.status(404).json({ error: 'Not found' });
    res.json(state);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Interact with persona
app.post('/api/personas/:id/interact', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });

    const result = await engine.interact(req.params.id, { message });
    res.json(result);
  } catch (e: any) {
    if (e.message?.includes('not found')) {
      return res.status(404).json({ error: e.message });
    }
    res.status(500).json({ error: e.message });
  }
});

// Get persona memory
app.get('/api/personas/:id/memory', async (req, res) => {
  try {
    const memory = await engine.getMemory(req.params.id);
    if (!memory) return res.status(404).json({ error: 'No memory found' });
    res.json(memory);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Delete persona
app.delete('/api/personas/:id', async (req, res) => {
  try {
    await engine.delete(req.params.id);
    res.status(204).send();
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ─── Start ───
const PORT = parseInt(process.env.PORT || '3000');
app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════╗
║       人格引擎 PERSONA ENGINE        ║
║          API Server v0.1.0           ║
╚══════════════════════════════════════╝

  → http://localhost:${PORT}

  POST   /api/personas              Create persona
  GET    /api/personas              List personas
  GET    /api/personas/:id          Get state
  POST   /api/personas/:id/interact Send message
  GET    /api/personas/:id/memory   Get memory
  DELETE /api/personas/:id          Delete persona
`);
});
