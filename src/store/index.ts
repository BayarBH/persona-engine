import type { PersonaState, MemorySnapshot, StoreConfig } from '../core/types.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

export interface Store {
  savePersona(state: PersonaState): Promise<void>;
  loadPersona(id: string): Promise<PersonaState | null>;
  deletePersona(id: string): Promise<void>;
  listPersonas(): Promise<{ id: string; name: string; age: number }[]>;

  saveMemory(personaId: string, memory: MemorySnapshot): Promise<void>;
  loadMemory(personaId: string): Promise<MemorySnapshot | null>;
}

export function createStore(config: StoreConfig = { type: 'memory' }): Store {
  switch (config.type) {
    case 'memory':
      return new MemoryStore();
    case 'json':
      return new JsonStore(config.path || './data');
    case 'sqlite':
      return new SqliteStore(config.path || './data/personas.db');
    default:
      throw new Error(`Unknown store type: ${config.type}`);
  }
}

// ─── In-Memory Store ───

class MemoryStore implements Store {
  private personas = new Map<string, PersonaState>();
  private memories = new Map<string, MemorySnapshot>();

  async savePersona(state: PersonaState) { this.personas.set(state.id, state); }
  async loadPersona(id: string) { return this.personas.get(id) || null; }
  async deletePersona(id: string) { this.personas.delete(id); this.memories.delete(id); }
  async listPersonas() {
    return [...this.personas.values()].map(p => ({ id: p.id, name: p.name, age: p.age }));
  }
  async saveMemory(personaId: string, memory: MemorySnapshot) { this.memories.set(personaId, memory); }
  async loadMemory(personaId: string) { return this.memories.get(personaId) || null; }
}

// ─── JSON File Store ───

class JsonStore implements Store {
  private dir: string;

  constructor(dir: string) {
    this.dir = dir;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  private personaPath(id: string) { return join(this.dir, `persona_${id}.json`); }
  private memoryPath(id: string) { return join(this.dir, `memory_${id}.json`); }

  async savePersona(state: PersonaState) {
    writeFileSync(this.personaPath(state.id), JSON.stringify(state, null, 2));
  }

  async loadPersona(id: string) {
    const path = this.personaPath(id);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf-8'));
  }

  async deletePersona(id: string) {
    const pPath = this.personaPath(id);
    const mPath = this.memoryPath(id);
    if (existsSync(pPath)) { const { unlinkSync } = await import('fs'); unlinkSync(pPath); }
    if (existsSync(mPath)) { const { unlinkSync } = await import('fs'); unlinkSync(mPath); }
  }

  async listPersonas() {
    const { readdirSync } = await import('fs');
    return readdirSync(this.dir)
      .filter(f => f.startsWith('persona_') && f.endsWith('.json'))
      .map(f => {
        const data = JSON.parse(readFileSync(join(this.dir, f), 'utf-8'));
        return { id: data.id, name: data.name, age: data.age };
      });
  }

  async saveMemory(personaId: string, memory: MemorySnapshot) {
    writeFileSync(this.memoryPath(personaId), JSON.stringify(memory, null, 2));
  }

  async loadMemory(personaId: string) {
    const path = this.memoryPath(personaId);
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf-8'));
  }
}

// ─── SQLite Store ───

class SqliteStore implements Store {
  private db: any;

  constructor(dbPath: string) {
    const dir = dirname(dbPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    // dynamic import to make sqlite optional
    try {
      const Database = require('better-sqlite3');
      this.db = new Database(dbPath);
      this.db.pragma('journal_mode = WAL');
      this.init();
    } catch {
      console.warn('better-sqlite3 not available, falling back to JSON store');
      throw new Error('SQLite not available');
    }
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS personas (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        age INTEGER DEFAULT 0,
        state TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS memories (
        persona_id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        FOREIGN KEY (persona_id) REFERENCES personas(id)
      );
    `);
  }

  async savePersona(state: PersonaState) {
    this.db.prepare(`
      INSERT OR REPLACE INTO personas (id, name, age, state, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(state.id, state.name, state.age, JSON.stringify(state), state.created_at, state.updated_at);
  }

  async loadPersona(id: string) {
    const row = this.db.prepare('SELECT state FROM personas WHERE id = ?').get(id) as any;
    return row ? JSON.parse(row.state) : null;
  }

  async deletePersona(id: string) {
    this.db.prepare('DELETE FROM memories WHERE persona_id = ?').run(id);
    this.db.prepare('DELETE FROM personas WHERE id = ?').run(id);
  }

  async listPersonas() {
    return this.db.prepare('SELECT id, name, age FROM personas ORDER BY updated_at DESC').all() as any[];
  }

  async saveMemory(personaId: string, memory: MemorySnapshot) {
    this.db.prepare(`
      INSERT OR REPLACE INTO memories (persona_id, data) VALUES (?, ?)
    `).run(personaId, JSON.stringify(memory));
  }

  async loadMemory(personaId: string) {
    const row = this.db.prepare('SELECT data FROM memories WHERE persona_id = ?').get(personaId) as any;
    return row ? JSON.parse(row.data) : null;
  }
}
