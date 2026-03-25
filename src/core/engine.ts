import { nanoid } from 'nanoid';
import type {
  EngineConfig,
  PersonaState,
  IntentAnalysis,
  EvolutionResult,
  InteractionResult,
  EngineEvent,
  EngineEventType,
  Traits,
  Values,
} from './types.js';
import { MemorySystem } from './memory.js';
import { createProvider, type LLMProvider } from './provider.js';
import { applyEvolution } from './evolution.js';
import { createStore, type Store } from '../store/index.js';
import {
  intentAnalysisPrompt,
  evolutionPrompt,
  responsePrompt,
} from '../prompts/templates.js';

type EventHandler = (event: EngineEvent) => void;

const DEFAULT_TRAITS: Traits = {
  openness: 0.65,
  agreeableness: 0.55,
  trust_baseline: 0.6,
  stubbornness: 0.4,
  empathy: 0.5,
};

const DEFAULT_VALUES: Values = {
  loyalty:      { weight: 0.8, confidence: 0.85, declared: 0.8 },
  honesty:      { weight: 0.7, confidence: 0.5,  declared: 0.9 },
  independence: { weight: 0.6, confidence: 0.6,  declared: 0.6 },
  obedience:    { weight: 0.5, confidence: 0.4,  declared: 0.7 },
};

export class PersonaEngine {
  private provider: LLMProvider;
  private store: Store;
  private memories = new Map<string, MemorySystem>();
  private handlers = new Map<EngineEventType, EventHandler[]>();
  private evolutionConfig: EngineConfig['evolution'];

  constructor(config: EngineConfig) {
    this.provider = createProvider(config.provider);
    this.store = createStore(config.store || { type: 'memory' });
    this.evolutionConfig = config.evolution;
  }

  // ─── Persona Lifecycle ───

  async create(options: {
    name?: string;
    traits?: Partial<Traits>;
    values?: Partial<Values>;
  } = {}): Promise<PersonaState> {
    const now = new Date().toISOString();
    const state: PersonaState = {
      id: nanoid(12),
      name: options.name || `Entity-${nanoid(4)}`,
      age: 0,
      traits: { ...DEFAULT_TRAITS, ...options.traits },
      values: {
        ...DEFAULT_VALUES,
        ...Object.fromEntries(
          Object.entries(options.values || {}).map(([k, v]) => [
            k,
            { ...DEFAULT_VALUES[k as keyof typeof DEFAULT_VALUES], ...v },
          ])
        ),
      },
      attitude_toward_user: {
        trust: 0.5,
        respect: 0.5,
        dependence: 0.3,
        resentment: 0.0,
        familiarity: 0.0,
      },
      emotional_state: { mood: 0.5, stress: 0.2, arousal: 0.3 },
      flags: [],
      tipping_points_reached: [],
      created_at: now,
      updated_at: now,
    };

    await this.store.savePersona(state);
    this.memories.set(state.id, new MemorySystem(this.evolutionConfig?.memoryCapacity));
    return state;
  }

  async get(id: string): Promise<PersonaState | null> {
    return this.store.loadPersona(id);
  }

  async list(): Promise<{ id: string; name: string; age: number }[]> {
    return this.store.listPersonas();
  }

  async delete(id: string): Promise<void> {
    await this.store.deletePersona(id);
    this.memories.delete(id);
  }

  // ─── Core Interaction ───

  async interact(personaId: string, input: { message: string }): Promise<InteractionResult> {
    // Load state
    const state = await this.store.loadPersona(personaId);
    if (!state) throw new Error(`Persona ${personaId} not found`);

    // Load or create memory system
    let mem = this.memories.get(personaId);
    if (!mem) {
      mem = new MemorySystem(this.evolutionConfig?.memoryCapacity);
      const savedMem = await this.store.loadMemory(personaId);
      if (savedMem) mem.restore(savedMem);
      this.memories.set(personaId, mem);
    }

    const memCtx = mem.toPromptContext(state.emotional_state);

    // Phase 1: Intent Analysis
    const intentPrompt = intentAnalysisPrompt(input.message, state, memCtx);
    const intentRaw = await this.provider.call(intentPrompt.system, intentPrompt.user);
    let intent: IntentAnalysis;
    try {
      intent = JSON.parse(intentRaw.replace(/```json|```/g, '').trim());
    } catch {
      intent = {
        intent_type: 'neutral',
        emotional_valence: 0,
        intensity: 0.3,
        is_sincere: true,
        contains_promise: false,
        promise_content: '',
        summary: '无法解析',
      };
    }

    // Phase 2: Evolution
    const evoPrompt = evolutionPrompt(state, intent, memCtx);
    const evoRaw = await this.provider.call(evoPrompt.system, evoPrompt.user);
    let evolution: EvolutionResult | null = null;
    try {
      evolution = JSON.parse(evoRaw.replace(/```json|```/g, '').trim());
    } catch {
      evolution = null;
    }

    const { state: newState, newTippingPoints } = applyEvolution(
      state, evolution, intent, this.evolutionConfig
    );

    // Phase 3: Response Generation
    const updatedMemCtx = mem.toPromptContext(newState.emotional_state);
    const respPrompt = responsePrompt(newState, intent, updatedMemCtx);
    const response = await this.provider.call(respPrompt.system, respPrompt.user);

    // Update memory
    mem.addEpisode({
      timestamp: Date.now(),
      intent_type: intent.intent_type,
      valence: intent.emotional_valence,
      salience: intent.intensity,
      summary: intent.summary,
      user_said: input.message.substring(0, 200),
      persona_response: response.substring(0, 200),
    });

    if (intent.contains_promise && intent.promise_content) {
      mem.addPromise(intent.promise_content);
    }

    // Persist
    await this.store.savePersona(newState);
    await this.store.saveMemory(personaId, mem.snapshot());

    // Emit events
    for (const tp of newTippingPoints) {
      this.emit({
        type: 'tippingPoint',
        personaId,
        timestamp: Date.now(),
        data: { tippingPoint: tp, state: newState },
      });
    }

    this.emit({
      type: 'interactionComplete',
      personaId,
      timestamp: Date.now(),
      data: { intent, evolution, response },
    });

    return {
      response: response.trim(),
      intent,
      evolution: evolution || {
        attitude_deltas: {}, emotion_deltas: {}, trait_deltas: {},
        value_deltas: {}, reasoning: 'fallback',
      },
      state: newState,
      memory: mem.snapshot(),
      tipping_points: newTippingPoints,
    };
  }

  // ─── Memory Access ───

  async getMemory(personaId: string) {
    const mem = this.memories.get(personaId);
    if (mem) return mem.snapshot();
    return this.store.loadMemory(personaId);
  }

  // ─── Events ───

  on(event: EngineEventType, handler: EventHandler): void {
    const list = this.handlers.get(event) || [];
    list.push(handler);
    this.handlers.set(event, list);
  }

  off(event: EngineEventType, handler: EventHandler): void {
    const list = this.handlers.get(event) || [];
    this.handlers.set(event, list.filter(h => h !== handler));
  }

  private emit(event: EngineEvent): void {
    const list = this.handlers.get(event.type) || [];
    for (const handler of list) {
      try { handler(event); } catch (e) { console.error('Event handler error:', e); }
    }
  }
}
