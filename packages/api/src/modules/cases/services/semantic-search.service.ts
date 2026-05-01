import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';

interface SearchResult {
  caseId: string;
  caseNumber: string;
  subject: string;
  score: number;
  matchType: 'SEMANTIC' | 'FULLTEXT';
}

@Injectable()
export class SemanticSearchService {
  private readonly logger = new Logger(SemanticSearchService.name);

  constructor(private readonly prisma: PrismaService) {}

  async search(
    query: string,
    filters?: { status?: string; caseType?: string; limit?: number },
  ): Promise<SearchResult[]> {
    const limit = filters?.limit ?? 20;

    // Tokenize query for TF-IDF / BM25 scoring
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return [];

    // Build Prisma where clause
    const where: any = {};
    if (filters?.status) where.status = filters.status;
    if (filters?.caseType) where.case_type = filters.caseType;

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
}
