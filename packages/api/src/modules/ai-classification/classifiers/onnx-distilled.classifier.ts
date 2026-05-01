import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as ort from 'onnxruntime-node';
import * as fs from 'fs';
import * as path from 'path';
import { ClassificationLabel, EmailInput } from '../types';

const LABELS = [
  'VALUATION_REQUEST',
  'LEGAL_OPINION',
  'TITLE_SEARCH',
  'INSURANCE_RENEWAL',
  'RELEASE_OF_COLLATERAL',
  'SITE_VISIT',
  'DOCUMENT_COLLECTION',
  'GENERAL_INQUIRY',
];

const MAX_LENGTH = 256;
const CLS_ID = 101;
const SEP_ID = 102;
const PAD_ID = 0;
const UNK_ID = 100;

/**
 * ONNX-based DistilBERT classifier.
 * Loads a fine-tuned DistilBERT model exported to ONNX format
 * and runs inference using onnxruntime-node.
 */
@Injectable()
export class OnnxDistilledClassifier implements OnModuleInit {
  private readonly logger = new Logger(OnnxDistilledClassifier.name);
  private session: ort.InferenceSession | null = null;
  private vocab: Map<string, number> = new Map();
  private ready = false;

  private readonly modelDir: string;

  constructor() {
    this.modelDir =
      process.env.ONNX_MODEL_DIR ||
      path.resolve(__dirname, '../../../../ml/model/onnx');
  }

  async onModuleInit(): Promise<void> {
    await this.loadModel();
  }

  async loadModel(): Promise<void> {
    const modelPath = path.join(this.modelDir, 'model.onnx');
    const tokenizerPath = path.join(this.modelDir, 'tokenizer.json');

    if (!fs.existsSync(modelPath)) {
      this.logger.warn(
        `ONNX model not found at ${modelPath}. Falling back to keyword classifier.`,
      );
      return;
    }

    try {
      // Load tokenizer vocab
      const tokenizerData = JSON.parse(fs.readFileSync(tokenizerPath, 'utf-8'));
      this.vocab = new Map(Object.entries(tokenizerData.model.vocab).map(
        ([token, id]) => [token, id as number],
      ));

      // Load ONNX model
      this.session = await ort.InferenceSession.create(modelPath, {
        executionProviders: ['cpu'],
        graphOptimizationLevel: 'all',
      });

      this.ready = true;
      this.logger.log(`ONNX model loaded from ${modelPath} (vocab: ${this.vocab.size})`);
    } catch (error) {
      this.logger.error(`Failed to load ONNX model: ${(error as Error).message}`);
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  /**
   * Classify an email and return all labels with softmax probabilities.
   */
  async classify(email: EmailInput): Promise<ClassificationLabel[]> {
    if (!this.ready || !this.session) {
      throw new Error('ONNX model not loaded');
    }

    const text = `Subject: ${email.subject}\n\n${email.body}`;
    const { inputIds, attentionMask } = this.tokenize(text);

    const inputIdsTensor = new ort.Tensor('int64', inputIds, [1, MAX_LENGTH]);
    const attentionMaskTensor = new ort.Tensor('int64', attentionMask, [1, MAX_LENGTH]);

    const results = await this.session.run({
      input_ids: inputIdsTensor,
      attention_mask: attentionMaskTensor,
    });

    const logits = results.logits.data as Float32Array;
    const probabilities = this.softmax(Array.from(logits));

    const labels: ClassificationLabel[] = LABELS.map((label, i) => ({
      label,
      confidence: probabilities[i],
    }));

    labels.sort((a, b) => b.confidence - a.confidence);
    return labels.slice(0, 5);
  }

  /**
   * BERT WordPiece tokenizer implementation.
   * Handles lowercasing, basic tokenization, and WordPiece subword splitting.
   */
  private tokenize(text: string): { inputIds: BigInt64Array; attentionMask: BigInt64Array } {
    // Normalize: lowercase, clean whitespace
    const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();

    // Basic tokenization: split on whitespace and punctuation
    const basicTokens = this.basicTokenize(normalized);

    // WordPiece tokenization
    const wordpieceIds: number[] = [CLS_ID];

    for (const token of basicTokens) {
      const subwordIds = this.wordpieceTokenize(token);
      // Check if adding these would exceed max length (minus SEP token)
      if (wordpieceIds.length + subwordIds.length >= MAX_LENGTH - 1) {
        break;
      }
      wordpieceIds.push(...subwordIds);
    }

    wordpieceIds.push(SEP_ID);

    // Pad to MAX_LENGTH
    const inputIds = new BigInt64Array(MAX_LENGTH);
    const attentionMask = new BigInt64Array(MAX_LENGTH);

    for (let i = 0; i < MAX_LENGTH; i++) {
      if (i < wordpieceIds.length) {
        inputIds[i] = BigInt(wordpieceIds[i]);
        attentionMask[i] = 1n;
      } else {
        inputIds[i] = BigInt(PAD_ID);
        attentionMask[i] = 0n;
      }
    }

    return { inputIds, attentionMask };
  }

  /**
   * Split text on whitespace and punctuation, similar to BERT's BasicTokenizer.
   */
  private basicTokenize(text: string): string[] {
    const tokens: string[] = [];
    let current = '';

    for (const char of text) {
      if (this.isPunctuation(char) || this.isWhitespace(char)) {
        if (current) {
          tokens.push(current);
          current = '';
        }
        if (this.isPunctuation(char)) {
          tokens.push(char);
        }
      } else {
        current += char;
      }
    }

    if (current) {
      tokens.push(current);
    }

    return tokens;
  }

  /**
   * WordPiece tokenization: greedily match the longest subword in vocabulary.
   */
  private wordpieceTokenize(token: string): number[] {
    if (this.vocab.has(token)) {
      return [this.vocab.get(token)!];
    }

    const ids: number[] = [];
    let start = 0;

    while (start < token.length) {
      let end = token.length;
      let found = false;

      while (start < end) {
        const substr = start === 0 ? token.slice(start, end) : `##${token.slice(start, end)}`;
        if (this.vocab.has(substr)) {
          ids.push(this.vocab.get(substr)!);
          found = true;
          break;
        }
        end--;
      }

      if (!found) {
        ids.push(UNK_ID);
        break;
      }

      start = end;
    }

    return ids;
  }

  private isPunctuation(char: string): boolean {
    const code = char.charCodeAt(0);
    return (
      (code >= 33 && code <= 47) ||
      (code >= 58 && code <= 64) ||
      (code >= 91 && code <= 96) ||
      (code >= 123 && code <= 126)
    );
  }

  private isWhitespace(char: string): boolean {
    return char === ' ' || char === '\t' || char === '\n' || char === '\r';
  }

  private softmax(logits: number[]): number[] {
    const max = Math.max(...logits);
    const exps = logits.map((l) => Math.exp(l - max));
    const sum = exps.reduce((a, b) => a + b, 0);
    return exps.map((e) => e / sum);
  }
}
