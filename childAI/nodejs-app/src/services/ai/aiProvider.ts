import * as fs from 'fs';
import * as path from 'path';

export type ProviderName = 'mock' | 'litellm' | 'bedrock' | '9router';

export interface ConversationHistoryItem {
  role: 'learner' | 'assistant' | 'system';
  content: string;
}

export interface GenerateInput {
  systemPrompt?: string;
  history: ConversationHistoryItem[];
  userMessage: string;
  maxTokens?: number;
}

export interface AIResponse {
  content: string;
  provider: ProviderName;
  model: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface AIStreamEvent {
  type: 'token' | 'done' | 'error';
  content?: string;
  error?: string;
}

export interface AIProvider {
  name: ProviderName;
  generateResponse(input: GenerateInput): Promise<AIResponse>;
  streamResponse(input: GenerateInput): AsyncGenerator<AIStreamEvent>;
}

export function loadSystemPrompt(): string {
  try {
    const p = path.resolve(process.cwd(), 'prompts/child_safe_system_prompt.txt');
    return fs.readFileSync(p, 'utf-8');
  } catch {
    return 'You are a helpful, child-safe learning assistant.';
  }
}
