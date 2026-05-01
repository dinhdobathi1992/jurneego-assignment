import { AIProvider, AIResponse, AIStreamEvent, GenerateInput, loadSystemPrompt } from './aiProvider';

const MOCK_RESPONSES = [
  "That's a great question! Learning is an adventure, and every question you ask makes you smarter. Let me explain...",
  "Wow, you're curious about that! Here's what I know: science tells us some amazing things about our world.",
  "Excellent thinking! The answer to your question involves some really cool concepts.",
  "Great question! Let's explore that together step by step.",
];

function getMockResponse(userMessage: string): string {
  const idx = userMessage.length % MOCK_RESPONSES.length;
  return MOCK_RESPONSES[idx] + ` You asked: "${userMessage.slice(0, 50)}..."`;
}

export const mockProvider: AIProvider = {
  name: 'mock',

  async generateResponse(input: GenerateInput): Promise<AIResponse> {
    const start = Date.now();
    // Simulate a small delay
    await new Promise((r) => setTimeout(r, 50 + Math.random() * 100));

    return {
      content: getMockResponse(input.userMessage),
      provider: 'mock',
      model: 'mock-v1',
      latencyMs: Date.now() - start,
      inputTokens: input.userMessage.split(' ').length,
      outputTokens: 30,
    };
  },

  async *streamResponse(input: GenerateInput): AsyncGenerator<AIStreamEvent> {
    const words = getMockResponse(input.userMessage).split(' ');
    for (const word of words) {
      await new Promise((r) => setTimeout(r, 20));
      yield { type: 'token', content: word + ' ' };
    }
    yield { type: 'done' };
  },
};
