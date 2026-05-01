import { Test, TestingModule } from '@nestjs/testing';
import {
  CollateralRiskService,
  DisbursalBlockerCategory,
  RiskTier,
} from '../services/collateral-risk.service';
import { PrismaService } from '../../../common/prisma';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';

describe('CollateralRiskService', () => {
  let service: CollateralRiskService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CollateralRiskService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(CollateralRiskService);
  });

  // ── computeRiskScore ────────────────────────────────────────────────

  describe('computeRiskScore', () => {
    it('should return a score between 0 and 100', () => {
      const score = service.computeRiskScore('VALUATION_REQUEST', 'Mumbai', 'vendor-1', 3, 5);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should return higher score when no vendor is assigned', () => {
      const withVendor = service.computeRiskScore('VALUATION_REQUEST', 'Mumbai', 'vendor-1', 5, 5);
      const withoutVendor = service.computeRiskScore('VALUATION_REQUEST', 'Mumbai', null, 5, 5);
      expect(withoutVendor).toBeGreaterThan(withVendor);
    });

    it('should return higher score when documents are incomplete', () => {
      const complete = service.computeRiskScore('VALUATION_REQUEST', 'Mumbai', 'v1', 5, 5);
      const incomplete = service.computeRiskScore('VALUATION_REQUEST', 'Mumbai', 'v1', 1, 5);
      expect(incomplete).toBeGreaterThan(complete);
    });

    it('should return higher score for unknown locations', () => {
      const knownCity = service.computeRiskScore('VALUATION_REQUEST', 'Mumbai', 'v1', 5, 5);
      const unknownCity = service.computeRiskScore('VALUATION_REQUEST', 'RemoteVillage', 'v1', 5, 5);
      expect(unknownCity).toBeGreaterThan(knownCity);
    });

    it('should cap score at 100', () => {
      const score = service.computeRiskScore('TITLE_SEARCH', 'RemoteVillage', null, 0, 10);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should assign higher base risk to TITLE_SEARCH than INSURANCE_RENEWAL', () => {
      const titleSearch = service.computeRiskScore('TITLE_SEARCH', 'Mumbai', 'v1', 5, 5);
      const insurance = service.computeRiskScore('INSURANCE_RENEWAL', 'Mumbai', 'v1', 5, 5);
      expect(titleSearch).toBeGreaterThan(insurance);
    });

    it('should handle zero required documents without penalty', () => {
      const score = service.computeRiskScore('VALUATION_REQUEST', 'Mumbai', 'v1', 0, 0);
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  // ── classifyRiskTier ────────────────────────────────────────────────

  describe('classifyRiskTier', () => {
    it('should classify 0-25 as LOW', () => {
      expect(service.classifyRiskTier(0)).toBe(RiskTier.LOW);
      expect(service.classifyRiskTier(25)).toBe(RiskTier.LOW);
    });

    it('should classify 26-50 as MEDIUM', () => {
      expect(service.classifyRiskTier(26)).toBe(RiskTier.MEDIUM);
      expect(service.classifyRiskTier(50)).toBe(RiskTier.MEDIUM);
    });

    it('should classify 51-75 as HIGH', () => {
      expect(service.classifyRiskTier(51)).toBe(RiskTier.HIGH);
      expect(service.classifyRiskTier(75)).toBe(RiskTier.HIGH);
    });

    it('should classify 76-100 as CRITICAL', () => {
      expect(service.classifyRiskTier(76)).toBe(RiskTier.CRITICAL);
      expect(service.classifyRiskTier(100)).toBe(RiskTier.CRITICAL);
    });
  });

  // ── computeDisbursalBlocker ─────────────────────────────────────────

  describe('computeDisbursalBlocker', () => {
    it('should return NONE for closed cases', () => {
      const result = service.computeDisbursalBlocker({
        status: 'CLOSED',
        caseType: 'VALUATION_REQUEST',
      });
      expect(result).toBe(DisbursalBlockerCategory.NONE);
    });

    it('should return NONE for cancelled cases', () => {
      const result = service.computeDisbursalBlocker({
        status: 'CANCELLED',
        caseType: 'VALUATION_REQUEST',
      });
      expect(result).toBe(DisbursalBlockerCategory.NONE);
    });

    it('should return DOCUMENT_MISSING when document completeness is below 100', () => {
      const result = service.computeDisbursalBlocker({
        status: 'IN_PROGRESS',
        caseType: 'VALUATION_REQUEST',
        documentCompletenessPercent: 60,
      });
      expect(result).toBe(DisbursalBlockerCategory.DOCUMENT_MISSING);
    });

    it('should return VALUATION_PENDING for valuation cases awaiting vendor', () => {
      const result = service.computeDisbursalBlocker({
        status: 'AWAITING_VENDOR',
        caseType: 'VALUATION_REQUEST',
        documentCompletenessPercent: 100,
      });
      expect(result).toBe(DisbursalBlockerCategory.VALUATION_PENDING);
    });

    it('should return LEGAL_PENDING for legal opinion cases in progress', () => {
      const result = service.computeDisbursalBlocker({
        status: 'IN_PROGRESS',
        caseType: 'LEGAL_OPINION',
        documentCompletenessPercent: 100,
      });
      expect(result).toBe(DisbursalBlockerCategory.LEGAL_PENDING);
    });

    it('should return TITLE_CLEAR_PENDING for title search cases in progress', () => {
      const result = service.computeDisbursalBlocker({
        status: 'IN_PROGRESS',
        caseType: 'TITLE_SEARCH',
        documentCompletenessPercent: 100,
      });
      expect(result).toBe(DisbursalBlockerCategory.TITLE_CLEAR_PENDING);
    });

    it('should return NONE for a valuation case in REVIEW with 100% docs', () => {
      const result = service.computeDisbursalBlocker({
        status: 'REVIEW',
        caseType: 'VALUATION_REQUEST',
        documentCompletenessPercent: 100,
      });
      expect(result).toBe(DisbursalBlockerCategory.NONE);
    });
  });

  // ── computeDocumentCompleteness ─────────────────────────────────────

  describe('computeDocumentCompleteness', () => {
    it('should return 0 when case is not found', async () => {
      mockPrisma.case.findUnique.mockResolvedValue(null);
      const result = await service.computeDocumentCompleteness('nonexistent');
      expect(result).toBe(0);
    });

    it('should return 100 when all required docs are present', async () => {
      mockPrisma.case.findUnique.mockResolvedValue({
        id: 'case-1',
        case_type: 'VALUATION_REQUEST', // 5 required
      });
      mockPrisma.caseAttachment.count.mockResolvedValue(5);

      const result = await service.computeDocumentCompleteness('case-1');
      expect(result).toBe(100);
    });

    it('should return 60 when 3 of 5 required docs are present', async () => {
      mockPrisma.case.findUnique.mockResolvedValue({
        id: 'case-1',
        case_type: 'VALUATION_REQUEST', // 5 required
      });
      mockPrisma.caseAttachment.count.mockResolvedValue(3);

      const result = await service.computeDocumentCompleteness('case-1');
      expect(result).toBe(60);
    });

    it('should cap at 100 even when more docs than required', async () => {
      mockPrisma.case.findUnique.mockResolvedValue({
        id: 'case-1',
        case_type: 'INSURANCE_RENEWAL', // 2 required
      });
      mockPrisma.caseAttachment.count.mockResolvedValue(10);

      const result = await service.computeDocumentCompleteness('case-1');
      expect(result).toBe(100);
    });
  });

  // ── detectValuationVariance ─────────────────────────────────────────

  describe('detectValuationVariance', () => {
    it('should return false for null valuation amount', () => {
      expect(service.detectValuationVariance(null, 'VALUATION_REQUEST', 'Mumbai')).toBe(false);
    });

    it('should return false for zero valuation amount', () => {
      expect(service.detectValuationVariance(0, 'VALUATION_REQUEST', 'Mumbai')).toBe(false);
    });

    it('should return false for a valuation within expected range', () => {
      // Mumbai median is 15M, 50% range is 7.5M-22.5M
      expect(service.detectValuationVariance(12_000_000, 'VALUATION_REQUEST', 'Mumbai')).toBe(false);
    });

    it('should return true for a valuation well below expected range', () => {
      // Mumbai median is 15M, lower bound is 7.5M
      expect(service.detectValuationVariance(2_000_000, 'VALUATION_REQUEST', 'Mumbai')).toBe(true);
    });

    it('should return true for a valuation well above expected range', () => {
      // Mumbai median is 15M, upper bound is 22.5M
      expect(service.detectValuationVariance(50_000_000, 'VALUATION_REQUEST', 'Mumbai')).toBe(true);
    });

    it('should use default median for unknown locations', () => {
      // Default median is 5M, range 2.5M-7.5M
      expect(service.detectValuationVariance(3_000_000, 'VALUATION_REQUEST', 'RemoteVillage')).toBe(false);
      expect(service.detectValuationVariance(500_000, 'VALUATION_REQUEST', 'RemoteVillage')).toBe(true);
    });
  });

  // ── getRiskSummary ──────────────────────────────────────────────────

  describe('getRiskSummary', () => {
    it('should return zero counts when no active cases exist', async () => {
      mockPrisma.case.findMany.mockResolvedValue([]);

      const result = await service.getRiskSummary();
      expect(result.totalCases).toBe(0);
      expect(result.low).toBe(0);
      expect(result.medium).toBe(0);
      expect(result.high).toBe(0);
      expect(result.critical).toBe(0);
      expect(result.cases).toEqual([]);
    });

    it('should classify cases by risk tier', async () => {
      mockPrisma.case.findMany.mockResolvedValue([
        { id: 'c1', case_number: 'ATL-2026-000001', case_type: 'VALUATION', collateral_risk_score: 10, property_city: 'Mumbai', status: 'IN_PROGRESS', document_completeness_percent: 100, valuation_variance_flag: false },
        { id: 'c2', case_number: 'ATL-2026-000002', case_type: 'LEGAL', collateral_risk_score: 40, property_city: 'Delhi', status: 'AWAITING_VENDOR', document_completeness_percent: 50, valuation_variance_flag: false },
        { id: 'c3', case_number: 'ATL-2026-000003', case_type: 'TITLE', collateral_risk_score: 85, property_city: null, status: 'NEW', document_completeness_percent: 0, valuation_variance_flag: true },
      ]);

      const result = await service.getRiskSummary();
      expect(result.totalCases).toBe(3);
      expect(result.low).toBe(1);
      expect(result.medium).toBe(1);
      expect(result.critical).toBe(1);
      expect(result.cases.length).toBe(3);
    });
  });

  // ── getDisbursalReadiness ───────────────────────────────────────────

  describe('getDisbursalReadiness', () => {
    it('should return empty groups when no active cases', async () => {
      mockPrisma.case.findMany.mockResolvedValue([]);

      const result = await service.getDisbursalReadiness();
      expect(result.totalBlocked).toBe(0);
      expect(result.totalReady).toBe(0);
      expect(result.groups.length).toBeGreaterThan(0); // Always returns all categories
    });

    it('should group cases by disbursal blocker category', async () => {
      mockPrisma.case.findMany.mockResolvedValue([
        {
          id: 'c1',
          case_number: 'ATL-2026-000001',
          case_type: 'VALUATION',
          status: 'IN_PROGRESS',
          collateral_risk_score: 30,
          disbursal_blocker_category: 'DOCUMENT_MISSING',
          property_city: 'Mumbai',
          assigned_fpr_id: 'fpr-1',
        },
        {
          id: 'c2',
          case_number: 'ATL-2026-000002',
          case_type: 'LEGAL',
          status: 'AWAITING_VENDOR',
          collateral_risk_score: 60,
          disbursal_blocker_category: 'LEGAL_PENDING',
          property_city: 'Delhi',
          assigned_fpr_id: 'fpr-2',
        },
        {
          id: 'c3',
          case_number: 'ATL-2026-000003',
          case_type: 'INSURANCE',
          status: 'REVIEW',
          collateral_risk_score: 10,
          disbursal_blocker_category: 'NONE',
          property_city: 'Pune',
          assigned_fpr_id: 'fpr-3',
        },
      ]);

      const result = await service.getDisbursalReadiness();
      expect(result.totalBlocked).toBe(2);
      expect(result.totalReady).toBe(1);

      const docMissing = result.groups.find((g) => g.category === 'DOCUMENT_MISSING');
      expect(docMissing?.count).toBe(1);

      const legalPending = result.groups.find((g) => g.category === 'LEGAL_PENDING');
      expect(legalPending?.count).toBe(1);

      const none = result.groups.find((g) => g.category === 'NONE');
      expect(none?.count).toBe(1);
    });
  });
});
