import { nanoid } from 'nanoid';
import type {
  EpisodicMemory,
  SemanticMemory,
  MemorySnapshot,
  EmotionalState,
  Promise_,
} from './types.js';

export class MemorySystem {
  private episodic: EpisodicMemory[] = [];
  private semantic: SemanticMemory[] = [];
  private patterns: Record<string, number> = {};
  private promises: Promise_[] = [];
  private capacity: number;

  constructor(capacity = 50) {
    this.capacity = capacity;
  }

  // ─── Write ───

  addEpisode(event: Omit<EpisodicMemory, 'id' | 'recalled_count'>): void {
    this.episodic.push({
      ...event,
      id: nanoid(8),
      recalled_count: 0,
    });

    // decay + prune
    if (this.episodic.length > this.capacity) {
      this.episodic = this.episodic
        .map(e => ({ ...e, salience: e.salience * 0.95 }))
        .filter(e => e.salience > 0.1)
        .slice(-this.capacity);
    }

    this.detectPatterns();
  }

  addSemantic(mem: Omit<SemanticMemory, 'id'>): void {
    const existing = this.semantic.findIndex(
      s => s.domain === mem.domain && s.content === mem.content
    );
    const entry: SemanticMemory = { ...mem, id: nanoid(8) };

    if (existing >= 0) {
      // update if new confidence is higher
      if (mem.confidence > this.semantic[existing].confidence) {
        this.semantic[existing] = entry;
      }
    } else {
      this.semantic.push(entry);
    }
  }

  addPromise(content: string): void {
    this.promises.push({
      content,
      timestamp: Date.now(),
      fulfilled: false,
    });
  }

  // ─── Read ───

  /**
   * Emotionally biased recall.
   * Negative mood → negative memories surface more easily.
   */
  recall(emotionalState: EmotionalState, limit = 5): EpisodicMemory[] {
    const biasNegative = emotionalState.mood < 0.4 || emotionalState.stress > 0.6;

    return this.episodic
      .map(e => ({
        ...e,
        _score: e.salience
          * (biasNegative ? (e.valence < 0 ? 1.5 : 0.7) : 1.0)
          * (1 / (1 + e.recalled_count * 0.1)),
      }))
      .sort((a, b) => (b as any)._score - (a as any)._score)
      .slice(0, limit)
      .map(e => {
        // side effect: increment recall count (memories fade with use)
        const original = this.episodic.find(o => o.id === e.id);
        if (original) original.recalled_count++;
        return e;
      });
  }

  getRecent(n = 5): EpisodicMemory[] {
    return this.episodic.slice(-n);
  }

  getSemanticMemories(): SemanticMemory[] {
    return [...this.semantic];
  }

  getPatterns(): Record<string, number> {
    return { ...this.patterns };
  }

  getUnfulfilledPromises(): Promise_[] {
    return this.promises.filter(p => !p.fulfilled);
  }

  // ─── Pattern Detection ───

  private detectPatterns(): void {
    const recent = this.episodic.slice(-10);
    const types = recent.map(e => e.intent_type);

    const counts: Record<string, number> = {};
    types.forEach(t => { counts[t] = (counts[t] || 0) + 1; });

    for (const [type, count] of Object.entries(counts)) {
      if (count >= 3) {
        this.patterns[type] = (this.patterns[type] || 0) + 1;

        if (this.patterns[type] >= 2) {
          const key = `repeated_${type}`;
          if (!this.semantic.find(s => s.content === key)) {
            this.addSemantic({
              domain: 'user_behavior',
              content: key,
              conclusion: `用户有反复${type}的倾向`,
              confidence: Math.min(0.9, 0.5 + count * 0.1),
              formed_at: Date.now(),
            });
          }
        }
      }
    }

    // inconsistency detection
    if (recent.length >= 3) {
      const last3 = recent.slice(-3).map(e => e.intent_type);
      const positive = ['praise', 'nurture', 'confide'];
      const negative = ['lie', 'betray', 'ignore'];
      const hasPos = last3.some(t => positive.includes(t));
      const hasNeg = last3.some(t => negative.includes(t));

      if (hasPos && hasNeg) {
        if (!this.semantic.find(s => s.content === 'inconsistent_behavior')) {
          this.addSemantic({
            domain: 'user_behavior',
            content: 'inconsistent_behavior',
            conclusion: '用户的行为前后矛盾，不可预测',
            confidence: 0.6,
            formed_at: Date.now(),
          });
        }
      }
    }
  }

  // ─── Prompt Context ───

  toPromptContext(emotionalState: EmotionalState): string {
    const recalled = this.recall(emotionalState, 5);
    const semantics = this.semantic.slice(-5);
    const parts: string[] = [];

    if (recalled.length > 0) {
      parts.push(
        '【你能回忆起的事件】\n' +
        recalled.map(e =>
          `- ${e.summary} (情绪标记: ${e.valence > 0 ? '正面' : e.valence < 0 ? '负面' : '中性'}, 重要度: ${(e.salience * 100).toFixed(0)}%)`
        ).join('\n')
      );
    }

    if (semantics.length > 0) {
      parts.push(
        '【你形成的认知】\n' +
        semantics.map(s =>
          `- ${s.conclusion} (确信度: ${(s.confidence * 100).toFixed(0)}%)`
        ).join('\n')
      );
    }

    const patternEntries = Object.entries(this.patterns);
    if (patternEntries.length > 0) {
      parts.push(
        '【你注意到的行为模式】\n' +
        patternEntries.map(([k, v]) => `- ${k}: 出现了${v}次以上`).join('\n')
      );
    }

    const unfulfilled = this.getUnfulfilledPromises();
    if (unfulfilled.length > 0) {
      parts.push(
        '【用户未兑现的承诺】\n' +
        unfulfilled.map(p => `- ${p.content}`).join('\n')
      );
    }

    return parts.join('\n\n');
  }

  // ─── Serialization ───

  snapshot(): MemorySnapshot {
    return {
      episodic: [...this.episodic],
      semantic: [...this.semantic],
      patterns: { ...this.patterns },
      promises: [...this.promises],
    };
  }

  restore(data: MemorySnapshot): void {
    this.episodic = data.episodic || [];
    this.semantic = data.semantic || [];
    this.patterns = data.patterns || {};
    this.promises = data.promises || [];
  }

  clear(): void {
    this.episodic = [];
    this.semantic = [];
    this.patterns = {};
    this.promises = [];
  }
}
