import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';

export interface DedupResult {
  isDuplicate: boolean;
  similarity: number; // 0-1
  matchedId?: string;
  method: 'EXACT' | 'SIMHASH' | 'NONE';
}

@Injectable()
export class DedupDetectorService {
  private readonly logger = new Logger(DedupDetectorService.name);
  private readonly hashStore = new Map<string, { simhash: bigint; id: string }>();
  private readonly SIMILARITY_THRESHOLD = 0.9; // 90% similarity
  private readonly exactHashStore = new Map<string, string>();

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

    // Fall through to SimHash for near-duplicate detection
    const simhash = this.computeSimHash(text);

    for (const [, stored] of this.hashStore) {
      const sim = this.similarity(simhash, stored.simhash);
      if (sim >= this.SIMILARITY_THRESHOLD) {
        return { isDuplicate: true, similarity: sim, matchedId: stored.id, method: 'SIMHASH' };
      }
    }

    // Store this document's hash
    this.hashStore.set(id, { simhash, id });
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
