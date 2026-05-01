import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';

interface SearchResult {
  caseId: string;
  caseNumber: string;
  subject: string;
  score: number;
  matchType: 'SEMANTIC' | 'FULLTEXT';
}

export type SearchMode = 'BM25' | 'EMBEDDING';

@Injectable()
export class SemanticSearchService {
  private readonly logger = new Logger(SemanticSearchService.name);

  /** FR-050.A5: Configurable search mode — 'BM25' (default) or 'EMBEDDING' */
  searchMode: SearchMode = 'BM25';

  constructor(private readonly prisma: PrismaService) {}

  async search(
    query: string,
    filters?: { status?: string; caseType?: string; limit?: number; language?: string },
  ): Promise<SearchResult[]> {
    const limit = filters?.limit ?? 20;

    // Tokenize query for TF-IDF / BM25 scoring
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return [];

    // Build Prisma where clause
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.caseType) where.case_type = filters.caseType;
    // FR-050.A4: Language filter in search
    if (filters?.language) where.detected_language = filters.language;

    const cases = await this.prisma.case.findMany({
      where,
      select: {
        id: true,
        case_number: true,
        ai_summary: true,
        case_type: true,
      },
      take: 200, // pre-filter pool
    });

    // Score each case using BM25-like algorithm
    const scored: SearchResult[] = [];
    const avgDocLength = cases.reduce((sum: number, c: any) => sum + (c.ai_summary?.length || 0), 0) / Math.max(cases.length, 1);
    const k1 = 1.2;
    const b = 0.75;

    for (const c of cases) {
      const text = `${c.ai_summary || ''} ${c.case_type || ''}`.toLowerCase();
      const docTokens = this.tokenize(text);
      const docLength = docTokens.length;

      let score = 0;
      for (const qt of queryTokens) {
        const tf = docTokens.filter((t: string) => t === qt).length;
        const idf = Math.log(1 + (cases.length - scored.length + 0.5) / (scored.length + 0.5));
        const numerator = tf * (k1 + 1);
        const denominator = tf + k1 * (1 - b + b * docLength / Math.max(avgDocLength, 1));
        score += idf * (numerator / denominator);
      }

      if (score > 0) {
        scored.push({
          caseId: c.id,
          caseNumber: c.case_number,
          subject: c.ai_summary || '',
          score: Math.round(score * 1000) / 1000,
          matchType: 'SEMANTIC',
        });
      }
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((t) => t.length > 2); // Skip very short tokens
  }

  /**
   * FR-050.A5: Compute a TF-IDF term vector from a list of tokens.
   */
  computeTermVector(tokens: string[]): Map<string, number> {
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
   * FR-050.A5: Cosine similarity between two term vectors.
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
   * FR-050.A5: Embedding-based search using cosine similarity on TF-IDF vectors.
   * Alternative to the BM25 scoring in the main `search` method.
   */
  async embeddingSearch(
    query: string,
    filters?: { status?: string; caseType?: string; limit?: number; language?: string },
  ): Promise<SearchResult[]> {
    const limit = filters?.limit ?? 20;
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return [];

    const queryVector = this.computeTermVector(queryTokens);

    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.caseType) where.case_type = filters.caseType;
    if (filters?.language) where.detected_language = filters.language;

    const cases = await this.prisma.case.findMany({
      where,
      select: {
        id: true,
        case_number: true,
        ai_summary: true,
        case_type: true,
      },
      take: 200,
    });

    const scored: SearchResult[] = [];

    for (const c of cases) {
      const text = `${c.ai_summary || ''} ${c.case_type || ''}`.toLowerCase();
      const docTokens = this.tokenize(text);
      const docVector = this.computeTermVector(docTokens);
      const score = this.cosineSimilarity(queryVector, docVector);

      if (score > 0) {
        scored.push({
          caseId: c.id,
          caseNumber: c.case_number,
          subject: c.ai_summary || '',
          score: Math.round(score * 1000) / 1000,
          matchType: 'SEMANTIC',
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }
}
