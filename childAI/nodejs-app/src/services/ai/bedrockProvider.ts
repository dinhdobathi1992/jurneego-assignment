import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
  ContentBlock,
  Message,
} from '@aws-sdk/client-bedrock-runtime';
import { AIProvider, AIResponse, AIStreamEvent, GenerateInput, loadSystemPrompt } from './aiProvider';
import { settings } from '../../config/settings';

function getClient(): BedrockRuntimeClient {
  return new BedrockRuntimeClient({ region: settings.AWS_REGION });
}

function buildBedrockMessages(input: GenerateInput): Message[] {
  const msgs: Message[] = [];

  for (const h of input.history) {
    if (h.role === 'system') continue; // system handled separately
    msgs.push({
      role: h.role === 'learner' ? 'user' : 'assistant',
      content: [{ text: h.content } as ContentBlock],
    });
  }

  msgs.push({
    role: 'user',
    content: [{ text: input.userMessage } as ContentBlock],
  });

  return msgs;
}

export const bedrockProvider: AIProvider = {
  name: 'bedrock',

  async generateResponse(input: GenerateInput): Promise<AIResponse> {
    const client = getClient();
    const start = Date.now();
    const systemPrompt = input.systemPrompt ?? loadSystemPrompt();

    const command = new ConverseCommand({
      modelId: settings.BEDROCK_MODEL_ID,
      system: [{ text: systemPrompt }],
      messages: buildBedrockMessages(input),
      inferenceConfig: {
        maxTokens: input.maxTokens ?? settings.AI_MAX_OUTPUT_TOKENS,
        temperature: 0.7,
      },
    });

    const response = await client.send(command);
    const textBlock = response.output?.message?.content?.find((b) => 'text' in b);
    const content = (textBlock as { text: string } | undefined)?.text ?? '';

    return {
      content,
      provider: 'bedrock',
      model: settings.BEDROCK_MODEL_ID,
      latencyMs: Date.now() - start,
      inputTokens: response.usage?.inputTokens,
      outputTokens: response.usage?.outputTokens,
    };
  },

  async *streamResponse(input: GenerateInput): AsyncGenerator<AIStreamEvent> {
    const client = getClient();
    const systemPrompt = input.systemPrompt ?? loadSystemPrompt();

    try {
      const command = new ConverseStreamCommand({
        modelId: settings.BEDROCK_MODEL_ID,
        system: [{ text: systemPrompt }],
        messages: buildBedrockMessages(input),
        inferenceConfig: {
          maxTokens: input.maxTokens ?? settings.AI_MAX_OUTPUT_TOKENS,
          temperature: 0.7,
        },
      });

      const response = await client.send(command);

      if (response.stream) {
        for await (const event of response.stream) {
          const delta = (event as any)?.contentBlockDelta?.delta?.text;
          if (delta) {
            yield { type: 'token', content: delta };
          }
        }
      }

      yield { type: 'done' };
    } catch (err) {
      yield { type: 'error', error: (err as Error).message };
    }
  },
};
