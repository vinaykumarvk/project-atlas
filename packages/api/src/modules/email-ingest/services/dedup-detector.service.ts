import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

export interface DedupResult {
  isDuplicate: boolean;
  similarity: number; // 0-1
  matchedId?: string;
  method: 'EXACT' | 'SIMHASH' | 'EMBEDDING' | 'NONE';
}

export type DedupMethod = 'SIMHASH' | 'EMBEDDING';

@Injectable()
export class DedupDetectorService {
  private readonly logger = new Logger(DedupDetectorService.name);
  private readonly hashStore = new Map<string, { simhash: bigint; id: string }>();
  private readonly SIMILARITY_THRESHOLD = 0.9; // 90% similarity
  private readonly exactHashStore = new Map<string, string>();
  private readonly embeddingStore = new Map<string, { vector: Map<string, number>; id: string }>();

  /** FR-014.A2: Configurable dedup method — 'SIMHASH' (default) or 'EMBEDDING' */
  dedupMethod: DedupMethod = 'SIMHASH';

  /**
   * Compute SimHash of a text document.
   * Uses token frequency weighting for 64-bit hash.
   */
  computeSimHash(text: string): bigint {
    const tokens = this.tokenize(text);
    const vector = new Array(64).fill(0);

    for (const token of tokens) {
      const hash = this.hashToken(token);
      for (let i = 0; i < 64; i++) {
        if ((hash >> BigInt(i)) & 1n) {
          vector[i]++;
        } else {
          vector[i]--;
        }
      }
    }

    let simhash = 0n;
    for (let i = 0; i < 64; i++) {
      if (vector[i] > 0) {
        simhash |= (1n << BigInt(i));
      }
    }

    return simhash;
  }

  /**
   * FR-014.A2: Compute a TF-IDF term-frequency vector for embedding-based dedup.
   * Returns a Map of token -> TF-IDF weight.
   */
  computeEmbeddingHash(text: string): Map<string, number> {
    const tokens = this.tokenize(text);
    const tf = new Map<string, number>();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) || 0) + 1);
    }
    // Normalize by document length
    for (const [token, count] of tf) {
      tf.set(token, count / Math.max(tokens.length, 1));
    }
    return tf;
  }

  /**
   * FR-014.A2: Cosine similarity between two TF-IDF vectors.
   */
  cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (const [token, weightA] of a) {
      normA += weightA * weightA;
      const weightB = b.get(token) || 0;
      dotProduct += weightA * weightB;
    }
    for (const [, weightB] of b) {
      normB += weightB * weightB;
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Compute Hamming distance between two SimHashes.
   */
  hammingDistance(a: bigint, b: bigint): number {
    let xor = a ^ b;
    let count = 0;
    while (xor > 0n) {
      count += Number(xor & 1n);
      xor >>= 1n;
    }
    return count;
  }

  /**
   * Compute similarity (0-1) from Hamming distance.
   */
  similarity(a: bigint, b: bigint): number {
    const distance = this.hammingDistance(a, b);
    return 1 - distance / 64;
  }

  /**
   * Check if text is a near-duplicate of any stored document.
   */
  checkDuplicate(id: string, text: string): DedupResult {
    // FR-014.A1: Check exact SHA-256 hash first
    const sha256 = this.computeSha256(text);
    const exactMatch = this.exactHashStore.get(sha256);
    if (exactMatch) {
      return { isDuplicate: true, similarity: 1.0, matchedId: exactMatch, method: 'EXACT' };
    }

    // FR-014.A2: Use configured dedup method for near-duplicate detection
    if (this.dedupMethod === 'EMBEDDING') {
      const vector = this.computeEmbeddingHash(text);
      for (const [, stored] of this.embeddingStore) {
        const sim = this.cosineSimilarity(vector, stored.vector);
        if (sim >= this.SIMILARITY_THRESHOLD) {
          return { isDuplicate: true, similarity: sim, matchedId: stored.id, method: 'EMBEDDING' };
        }
      }
      this.embeddingStore.set(id, { vector, id });
    } else {
      // Fall through to SimHash for near-duplicate detection
      const simhash = this.computeSimHash(text);
      for (const [, stored] of this.hashStore) {
        const sim = this.similarity(simhash, stored.simhash);
        if (sim >= this.SIMILARITY_THRESHOLD) {
          return { isDuplicate: true, similarity: sim, matchedId: stored.id, method: 'SIMHASH' };
        }
      }
      this.hashStore.set(id, { simhash, id });
    }

    // Store exact hash
    this.exactHashStore.set(sha256, id);
    return { isDuplicate: false, similarity: 0, method: 'NONE' };
  }

  computeSha256(text: string): string {
    return createHash('sha256').update(text).digest('hex');
  }

  /**
   * Clear stored hashes (for testing).
   */
  clear(): void {
    this.hashStore.clear();
    this.exactHashStore.clear();
    this.embeddingStore.clear();
  }

  getStoredCount(): number {
    return this.hashStore.size;
  }

  private tokenize(text: string): string[] {
    return text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(t => t.length > 0);
  }

  private hashToken(token: string): bigint {
    // FNV-1a 64-bit hash
    let hash = 14695981039346656037n;
    for (let i = 0; i < token.length; i++) {
      hash ^= BigInt(token.charCodeAt(i));
      hash = (hash * 1099511628211n) & 0xFFFFFFFFFFFFFFFFn;
    }
    return hash;
  }
}
