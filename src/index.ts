export { PersonaEngine } from './core/engine.js';
export { MemorySystem } from './core/memory.js';
export { applyEvolution } from './core/evolution.js';
export { createProvider } from './core/provider.js';
export { createStore } from './store/index.js';

export type {
  PersonaState,
  Traits,
  Values,
  ValueDimension,
  Attitude,
  EmotionalState,
  IntentAnalysis,
  EvolutionResult,
  InteractionResult,
  EngineConfig,
  LLMProviderConfig,
  StoreConfig,
  EvolutionConfig,
  EngineEvent,
  EngineEventType,
  MemorySnapshot,
  EpisodicMemory,
  SemanticMemory,
} from './core/types.js';
