import OpenAI from 'openai';
import { config } from '../config';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey: config.openaiApiKey });
  }
  return client;
}

export interface GeneratedEmail {
  subject: string;
  body: string;
  thread_context: string | null;
  ground_truth_entities: { entity_type: string; value: string }[];
  sender_persona: string;
  geography: string;
  tone: string;
  expected_sentiment: string;
  expected_urgency_signal: string;
}

interface GenerationResponse {
  emails: GeneratedEmail[];
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;
const CONCURRENCY_LIMIT = 3;
const BATCH_DELAY_MS = 500;

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callWithRetry(
  systemPrompt: string,
  userPrompt: string,
): Promise<GeneratedEmail[]> {
  const openai = getClient();

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.9,
        max_tokens: 4096,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      const parsed: GenerationResponse = JSON.parse(content);
      if (!parsed.emails || !Array.isArray(parsed.emails)) {
        throw new Error('Response missing "emails" array');
      }

      return parsed.emails;
    } catch (error) {
      const isLast = attempt === MAX_RETRIES - 1;
      if (isLast) throw error;

      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      console.warn(
        `OpenAI call failed (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${delay}ms:`,
        error instanceof Error ? error.message : error,
      );
      await sleep(delay);
    }
  }

  throw new Error('Unreachable');
}

export interface BatchRequest {
  id: string;
  systemPrompt: string;
  userPrompt: string;
}

export interface BatchResult {
  id: string;
  emails: GeneratedEmail[];
  error?: string;
}

export async function generateBatch(requests: BatchRequest[]): Promise<BatchResult[]> {
  const results: BatchResult[] = [];
  const queue = [...requests];

  async function processOne(): Promise<void> {
    while (queue.length > 0) {
      const request = queue.shift()!;
      try {
        const emails = await callWithRetry(request.systemPrompt, request.userPrompt);
        results.push({ id: request.id, emails });
      } catch (error) {
        results.push({
          id: request.id,
          emails: [],
          error: error instanceof Error ? error.message : String(error),
        });
      }
      await sleep(BATCH_DELAY_MS);
    }
  }

  // Run with concurrency limit
  const workers = Array.from({ length: Math.min(CONCURRENCY_LIMIT, requests.length) }, () =>
    processOne(),
  );
  await Promise.all(workers);

  return results;
}
