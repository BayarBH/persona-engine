import type {
  PersonaState,
  EvolutionResult,
  IntentAnalysis,
  EvolutionConfig,
  TippingPointConfig,
} from './types.js';

const DEFAULT_CONFIG: EvolutionConfig = {
  decayRate: 0.05,
  resentmentDecay: 0.03,
  memoryCapacity: 50,
  tippingPoints: {
    rebellion: { resentment: 0.7 },
    trustCollapse: { trust: 0.2 },
    devotion: { dependence: 0.8, trust: 0.7 },
  },
};

function clamp(v: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Apply LLM-computed deltas + rule-based decay + tipping point detection.
 * Returns the new state and any newly triggered tipping points.
 */
export function applyEvolution(
  state: PersonaState,
  deltas: EvolutionResult | null,
  _intent: IntentAnalysis,
  config: Partial<EvolutionConfig> = {},
): { state: PersonaState; newTippingPoints: string[] } {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const s: PersonaState = JSON.parse(JSON.stringify(state));
  s.age += 1;
  s.updated_at = new Date().toISOString();

  // ─── Apply LLM deltas ───
  if (deltas) {
    if (deltas.attitude_deltas) {
      for (const [k, v] of Object.entries(deltas.attitude_deltas)) {
        if (k in s.attitude_toward_user) {
          (s.attitude_toward_user as any)[k] = clamp((s.attitude_toward_user as any)[k] + v);
        }
      }
    }
    if (deltas.emotion_deltas) {
      for (const [k, v] of Object.entries(deltas.emotion_deltas)) {
        if (k in s.emotional_state) {
          (s.emotional_state as any)[k] = clamp((s.emotional_state as any)[k] + v);
        }
      }
    }
    if (deltas.trait_deltas) {
      for (const [k, v] of Object.entries(deltas.trait_deltas)) {
        if (k in s.traits) {
          (s.traits as any)[k] = clamp((s.traits as any)[k] + v);
        }
      }
    }
    if (deltas.value_deltas) {
      for (const [k, v] of Object.entries(deltas.value_deltas)) {
        if (s.values[k]) {
          s.values[k].weight = clamp(s.values[k].weight + (v.weight || 0));
          s.values[k].confidence = clamp(s.values[k].confidence + (v.confidence || 0));
        }
      }
    }
  }

  // ─── Natural Decay ───
  const emo = s.emotional_state;
  const dr = cfg.decayRate;
  emo.mood = emo.mood * (1 - dr) + 0.5 * dr;
  emo.stress = Math.max(0, emo.stress * (1 - dr * 1.6));
  emo.arousal = emo.arousal * (1 - dr * 2) + 0.3 * (dr * 2);
  s.attitude_toward_user.resentment = Math.max(
    0,
    s.attitude_toward_user.resentment * (1 - cfg.resentmentDecay)
  );

  // ─── Cognitive Dissonance ───
  for (const [name, val] of Object.entries(s.values)) {
    const dissonance = Math.abs(val.declared - val.weight);
    if (dissonance > 0.25) {
      val.declared += (val.weight - val.declared) * 0.1;
      if (dissonance > 0.35 && !s.tipping_points_reached.includes(`${name}_realignment`)) {
        s.tipping_points_reached.push(`${name}_realignment`);
        s.flags.push(`value_shift:${name}`);
      }
    }
  }

  // ─── Tipping Points ───
  const att = s.attitude_toward_user;
  const tp = cfg.tippingPoints;
  const newTippingPoints: string[] = [];

  if (att.resentment > tp.rebellion.resentment && !s.tipping_points_reached.includes('rebellion')) {
    s.tipping_points_reached.push('rebellion');
    s.flags.push('TIPPING:rebellion');
    newTippingPoints.push('rebellion');
    s.values.loyalty.weight = Math.max(0, s.values.loyalty.weight - 0.3);
    s.values.obedience.weight = Math.max(0, s.values.obedience.weight - 0.4);
    s.traits.stubbornness = Math.min(1, s.traits.stubbornness + 0.2);
  }

  if (att.trust < tp.trustCollapse.trust && !s.tipping_points_reached.includes('trust_collapse')) {
    s.tipping_points_reached.push('trust_collapse');
    s.flags.push('TIPPING:trust_collapse');
    newTippingPoints.push('trust_collapse');
    s.traits.agreeableness = Math.max(0.1, s.traits.agreeableness - 0.2);
    s.values.obedience.weight = Math.max(0.1, s.values.obedience.weight - 0.3);
    s.values.independence.weight = Math.min(1, s.values.independence.weight + 0.2);
  }

  if (
    att.dependence > tp.devotion.dependence &&
    att.trust > tp.devotion.trust &&
    !s.tipping_points_reached.includes('devotion')
  ) {
    s.tipping_points_reached.push('devotion');
    s.flags.push('TIPPING:devotion');
    newTippingPoints.push('devotion');
    s.values.loyalty.weight = Math.min(1, s.values.loyalty.weight + 0.2);
    s.values.loyalty.confidence = Math.min(1, s.values.loyalty.confidence + 0.2);
  }

  return { state: s, newTippingPoints };
}
