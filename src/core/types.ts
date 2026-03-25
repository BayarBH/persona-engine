// ─── Persona State Types ───

export interface Traits {
  openness: number;
  agreeableness: number;
  trust_baseline: number;
  stubbornness: number;
  empathy: number;
}

export interface ValueDimension {
  weight: number;      // actual importance (0-1)
  confidence: number;  // how resistant to change (0-1)
  declared: number;    // what the persona claims to believe (can diverge from weight)
}

export interface Values {
  loyalty: ValueDimension;
  honesty: ValueDimension;
  independence: ValueDimension;
  obedience: ValueDimension;
  [key: string]: ValueDimension;   // extensible
}

export interface Attitude {
  trust: number;
  respect: number;
  dependence: number;
  resentment: number;
  familiarity: number;
}

export interface EmotionalState {
  mood: number;       // 0=very negative, 1=very positive
  stress: number;     // 0-1
  arousal: number;    // engagement level 0-1
}

export interface PersonaState {
  id: string;
  name: string;
  age: number;                          // interaction count
  traits: Traits;
  values: Values;
  attitude_toward_user: Attitude;
  emotional_state: EmotionalState;
  flags: string[];
  tipping_points_reached: string[];
  created_at: string;
  updated_at: string;
}

// ─── Memory Types ───

export interface EpisodicMemory {
  id: string;
  timestamp: number;
  intent_type: string;
  valence: number;          // -1 to 1
  salience: number;         // importance 0-1
  summary: string;
  user_said: string;
  persona_response: string;
  recalled_count: number;
}

export interface SemanticMemory {
  id: string;
  domain: string;
  content: string;          // unique key
  conclusion: string;       // human-readable conclusion
  confidence: number;
  formed_at: number;
}

export interface MemorySnapshot {
  episodic: EpisodicMemory[];
  semantic: SemanticMemory[];
  patterns: Record<string, number>;
  promises: Promise_[];
}

export interface Promise_ {
  content: string;
  timestamp: number;
  fulfilled: boolean;
}

// ─── Intent Analysis ───

export type IntentType =
  | 'praise' | 'command' | 'confide' | 'lie' | 'challenge'
  | 'ignore' | 'betray' | 'nurture' | 'neutral' | 'threat'
  | 'apology' | 'question' | 'manipulation';

export interface IntentAnalysis {
  intent_type: IntentType;
  emotional_valence: number;    // -1 to 1
  intensity: number;            // 0 to 1
  is_sincere: boolean;
  contains_promise: boolean;
  promise_content: string;
  summary: string;
}

// ─── Evolution Deltas ───

export interface EvolutionResult {
  attitude_deltas: Partial<Attitude>;
  emotion_deltas: Partial<EmotionalState>;
  trait_deltas: Partial<Traits>;
  value_deltas: Record<string, { weight?: number; confidence?: number }>;
  reasoning: string;
}

// ─── Interaction Result ───

export interface InteractionResult {
  response: string;
  intent: IntentAnalysis;
  evolution: EvolutionResult;
  state: PersonaState;
  memory: MemorySnapshot;
  tipping_points: string[];     // newly triggered tipping points
}

// ─── Configuration ───

export interface LLMProviderConfig {
  type: 'anthropic' | 'openai' | 'custom';
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  callFn?: (system: string, user: string) => Promise<string>;   // for custom providers
}

export interface StoreConfig {
  type: 'memory' | 'json' | 'sqlite';
  path?: string;
}

export interface TippingPointConfig {
  rebellion: { resentment: number };
  trustCollapse: { trust: number };
  devotion: { dependence: number; trust: number };
}

export interface EvolutionConfig {
  decayRate: number;
  resentmentDecay: number;
  memoryCapacity: number;
  tippingPoints: TippingPointConfig;
}

export interface EngineConfig {
  provider: LLMProviderConfig;
  store?: StoreConfig;
  evolution?: Partial<EvolutionConfig>;
}

// ─── Events ───

export type EngineEventType =
  | 'tippingPoint'
  | 'memoryFormed'
  | 'valueShift'
  | 'interactionComplete';

export interface EngineEvent {
  type: EngineEventType;
  personaId: string;
  timestamp: number;
  data: Record<string, any>;
}
