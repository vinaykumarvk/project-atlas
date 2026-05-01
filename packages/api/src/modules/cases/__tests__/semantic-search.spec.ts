import { Test, TestingModule } from '@nestjs/testing';
import { SemanticSearchService } from '../services/semantic-search.service';
import { PrismaService } from '../../../common/prisma';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';

describe('SemanticSearchService (FR-050.A5)', () => {
  let service: SemanticSearchService;
  let prisma: ReturnType<typeof createMockPrismaService>;

  beforeEach(async () => {
    prisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SemanticSearchService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<SemanticSearchService>(SemanticSearchService);
  });

  it('should return empty results for empty query', async () => {
    const results = await service.search('');
    expect(results).toEqual([]);
  });

  it('should tokenize and score cases using BM25', async () => {
    (prisma.case.findMany as jest.Mock).mockResolvedValue([
      { id: 'c1', case_number: 'CASE-001', ai_summary: 'Property valuation request for Mumbai', case_type: 'VALUATION' },
      { id: 'c2', case_number: 'CASE-002', ai_summary: 'Legal opinion for Delhi property', case_type: 'LEGAL' },
      { id: 'c3', case_number: 'CASE-003', ai_summary: 'Insurance claim processing', case_type: 'INSURANCE' },
    ]);

    const results = await service.search('property valuation');
    expect(results.length).toBeGreaterThan(0);
    // First result should be more relevant to "property valuation"
    expect(results[0].caseId).toBe('c1');
  });

  it('should respect the limit filter', async () => {
    (prisma.case.findMany as jest.Mock).mockResolvedValue([
      { id: 'c1', case_number: 'CASE-001', ai_summary: 'Property valuation Mumbai', case_type: 'VALUATION' },
      { id: 'c2', case_number: 'CASE-002', ai_summary: 'Property assessment Pune', case_type: 'VALUATION' },
    ]);

    const results = await service.search('property', { limit: 1 });
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it('should tokenize text correctly', () => {
    const tokens = service.tokenize('Hello, World! This is a test.');
    expect(tokens).toContain('hello');
    expect(tokens).toContain('world');
    expect(tokens).toContain('this');
    expect(tokens).toContain('test');
    // Short tokens (length <= 2) should be filtered
    expect(tokens).not.toContain('is');
  });

  it('should set matchType to SEMANTIC for all results', async () => {
    (prisma.case.findMany as jest.Mock).mockResolvedValue([
      { id: 'c1', case_number: 'CASE-001', ai_summary: 'Property valuation', case_type: 'VALUATION' },
    ]);

    const results = await service.search('property');
    for (const r of results) {
      expect(r.matchType).toBe('SEMANTIC');
    }
  });
});
