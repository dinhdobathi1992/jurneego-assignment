import OpenAI from 'openai';
import { AIProvider, AIResponse, AIStreamEvent, GenerateInput, loadSystemPrompt } from './aiProvider';
import { settings } from '../../config/settings';

function getClient(): OpenAI {
  return new OpenAI({
    baseURL: settings.NINE_ROUTER_API_BASE ?? 'http://oc.dinhdobathi.com:20128/v1',
    apiKey: settings.NINE_ROUTER_API_KEY ?? 'dev',
    timeout: settings.AI_TIMEOUT_SECONDS * 1000,
  });
}

function buildMessages(input: GenerateInput): OpenAI.ChatCompletionMessageParam[] {
  const systemPrompt = input.systemPrompt ?? loadSystemPrompt();
  const msgs: OpenAI.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ];

  for (const h of input.history) {
    msgs.push({
      role: h.role === 'learner' ? 'user' : h.role === 'assistant' ? 'assistant' : 'system',
      content: h.content,
    });
  }

  msgs.push({ role: 'user', content: input.userMessage });
  return msgs;
}

export const nineRouterProvider: AIProvider = {
  name: '9router',

  async generateResponse(input: GenerateInput): Promise<AIResponse> {
    const client = getClient();
    const start = Date.now();

    const completion = await client.chat.completions.create({
      model: settings.NINE_ROUTER_MODEL,
      messages: buildMessages(input),
      max_tokens: input.maxTokens ?? settings.AI_MAX_OUTPUT_TOKENS,
      temperature: 0.7,
    });

    const content = completion.choices[0]?.message?.content ?? '';
    return {
      content,
      provider: '9router',
      model: settings.NINE_ROUTER_MODEL,
      latencyMs: Date.now() - start,
      inputTokens: completion.usage?.prompt_tokens,
      outputTokens: completion.usage?.completion_tokens,
    };
  },

  async *streamResponse(input: GenerateInput): AsyncGenerator<AIStreamEvent> {
    const client = getClient();

    try {
      const stream = await client.chat.completions.create({
        model: settings.NINE_ROUTER_MODEL,
        messages: buildMessages(input),
        max_tokens: input.maxTokens ?? settings.AI_MAX_OUTPUT_TOKENS,
        temperature: 0.7,
        stream: true,
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content;
        if (delta) {
          yield { type: 'token', content: delta };
        }
      }
      yield { type: 'done' };
    } catch (err) {
      yield { type: 'error', error: (err as Error).message };
    }
  },
};
