import Anthropic from '@anthropic-ai/sdk';
import type { LLMProviderConfig } from '../core/types.js';

export interface LLMProvider {
  call(system: string, user: string): Promise<string>;
}

export function createProvider(config: LLMProviderConfig): LLMProvider {
  switch (config.type) {
    case 'anthropic':
      return new AnthropicProvider(config);
    case 'openai':
      return new OpenAIProvider(config);
    case 'custom':
      if (!config.callFn) throw new Error('Custom provider requires callFn');
      return { call: config.callFn };
    default:
      throw new Error(`Unknown provider type: ${config.type}`);
  }
}

class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor(config: LLMProviderConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });
    this.model = config.model || 'claude-sonnet-4-20250514';
  }

  async call(system: string, user: string): Promise<string> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: user }],
    });

    return response.content
      .map(block => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim();
  }
}

class OpenAIProvider implements LLMProvider {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(config: LLMProviderConfig) {
    this.apiKey = config.apiKey || process.env.OPENAI_API_KEY || '';
    this.model = config.model || 'gpt-4o';
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
  }

  async call(system: string, user: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        max_tokens: 1024,
      }),
    });
    const data = await res.json() as any;
    return data.choices?.[0]?.message?.content?.trim() || '';
  }
}
