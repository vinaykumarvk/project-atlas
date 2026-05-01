import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { LlmClassifierProvider } from './llm.classifier';
import { EmailInput, LlmClassificationResult } from '../types';

const SYSTEM_PROMPT = `You are an email classifier for a housing finance collateral management team (Bajaj Housing Finance, India).

Given an email, classify it into exactly ONE of the provided labels. Return a JSON object with this exact structure:
{
  "classifications": [
    { "label": "<LABEL>", "confidence": <0.0-1.0>, "rationale": "<one sentence>" }
  ]
}

Rules:
- Return ALL provided labels, each with a confidence score.
- Confidence scores across all labels must sum to approximately 1.0.
- The rationale should explain why this label fits or doesn't fit.
- Consider the full email context: subject, body, and any thread context.
- For ambiguous emails, distribute confidence more evenly but still pick a clear winner.
- Common Indian English, Hinglish, and informal language is expected.
- If the email is clearly noise/spam/OOO, classify as GENERAL_INQUIRY with low confidence.`;

@Injectable()
export class OpenAiClassifier implements LlmClassifierProvider {
  private readonly logger = new Logger(OpenAiClassifier.name);
  private readonly client: OpenAI;
  private readonly model: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required for OpenAiClassifier');
    }
    this.client = new OpenAI({ apiKey });
    this.model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  }

  async classify(
    email: EmailInput,
    labels: string[],
  ): Promise<LlmClassificationResult[]> {
    const userPrompt = this.buildUserPrompt(email, labels);

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
        temperature: 0.1,
        max_tokens: 1024,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('Empty response from OpenAI');
      }

      return this.parseResponse(content, labels);
    } catch (error) {
      this.logger.error(`OpenAI classification failed: ${(error as Error).message}`);
      throw error;
    }
  }

  private buildUserPrompt(email: EmailInput, labels: string[]): string {
    let prompt = `Classify this email into one of these labels: ${labels.join(', ')}\n\n`;
    prompt += `Subject: ${email.subject}\n\n`;
    prompt += `Body:\n${email.body}`;
    if (email.threadContext) {
      prompt += `\n\nThread Context:\n${email.threadContext}`;
    }
    return prompt;
  }

  private parseResponse(content: string, labels: string[]): LlmClassificationResult[] {
    const parsed = JSON.parse(content);
    const classifications = parsed.classifications;

    if (!Array.isArray(classifications)) {
      throw new Error('Invalid response format: missing classifications array');
    }

    return classifications
      .filter((c: any) => labels.includes(c.label))
      .map((c: any) => ({
        label: String(c.label),
        confidence: Number(c.confidence),
        rationale: String(c.rationale || ''),
      }))
      .sort((a: LlmClassificationResult, b: LlmClassificationResult) => b.confidence - a.confidence);
  }
}
