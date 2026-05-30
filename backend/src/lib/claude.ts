import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';

export const claude = new Anthropic({
  apiKey: config.ANTHROPIC_API_KEY,
});

export interface ClaudeCallResult<T> {
  data: T;
  tokensInput: number;
  tokensOutput: number;
  rawText: string;
}

/**
 * Call Claude and parse JSON response.
 * Throws if response is not valid JSON.
 */
export async function callClaudeJson<T>(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  /** Override do modelo. Default = CLAUDE_MODEL (Sonnet). Tarefas baratas de
   *  classificação (PICO, relevance) passam CLAUDE_MODEL_FAST (Haiku). */
  model?: string;
}): Promise<ClaudeCallResult<T>> {
  const response = await claude.messages.create({
    model: opts.model ?? config.CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? 2048,
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text block in Claude response');
  }

  // Strip markdown code fences if present
  let jsonText = textBlock.text.trim();
  jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');

  let data: T;
  try {
    data = JSON.parse(jsonText) as T;
  } catch (e) {
    throw new Error(`Claude returned invalid JSON: ${jsonText.slice(0, 200)}...`);
  }

  return {
    data,
    tokensInput: response.usage.input_tokens,
    tokensOutput: response.usage.output_tokens,
    rawText: textBlock.text,
  };
}

/**
 * Call Claude for free-form text (synthesis).
 */
export async function callClaudeText(opts: {
  system: string;
  user: string;
  maxTokens?: number;
  /** Override do modelo. Default = CLAUDE_MODEL (Sonnet). */
  model?: string;
}): Promise<ClaudeCallResult<string>> {
  const response = await claude.messages.create({
    model: opts.model ?? config.CLAUDE_MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    messages: [{ role: 'user', content: opts.user }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text block in Claude response');
  }

  return {
    data: textBlock.text,
    tokensInput: response.usage.input_tokens,
    tokensOutput: response.usage.output_tokens,
    rawText: textBlock.text,
  };
}
