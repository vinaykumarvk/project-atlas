import { Test, TestingModule } from '@nestjs/testing';
import { CustomReportService, ReportSchema } from '../services/custom-report.service';
import { PrismaService } from '../../../common/prisma';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';

describe('CustomReportService', () => {
  let service: CustomReportService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;

  beforeEach(async () => {
    mockPrisma = createMockPrismaService();

    // Add groupBy mock to the case model
    mockPrisma.case.groupBy = jest.fn().mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomReportService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(CustomReportService);
  });

  describe('validateSchema (FR-113.A1)', () => {
    it('should validate a correct schema', () => {
      const schema: ReportSchema = {
        name: 'Test Report',
        dimensions: ['case_type', 'priority'],
        measures: ['count', 'avg_tat'],
      };

      const result = service.validateSchema(schema);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty name', () => {
      const schema: ReportSchema = {
        name: '',
        dimensions: ['case_type'],
        measures: ['count'],
      };

      const result = service.validateSchema(schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Report name is required');
    });

    it('should reject empty dimensions', () => {
      const schema: ReportSchema = {
        name: 'Test',
        dimensions: [],
        measures: ['count'],
      };

      const result = service.validateSchema(schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one dimension is required');
    });

    it('should reject invalid dimensions', () => {
      const schema: ReportSchema = {
        name: 'Test',
        dimensions: ['invalid_dimension'],
        measures: ['count'],
      };

      const result = service.validateSchema(schema);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid dimension'))).toBe(true);
    });

    it('should reject empty measures', () => {
      const schema: ReportSchema = {
        name: 'Test',
        dimensions: ['case_type'],
        measures: [],
      };

      const result = service.validateSchema(schema);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one measure is required');
    });

    it('should reject invalid measures', () => {
      const schema: ReportSchema = {
        name: 'Test',
        dimensions: ['case_type'],
        measures: ['invalid_measure'],
      };

      const result = service.validateSchema(schema);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid measure'))).toBe(true);
    });

    it('should reject invalid groupBy fields', () => {
      const schema: ReportSchema = {
        name: 'Test',
        dimensions: ['case_type'],
        measures: ['count'],
        groupBy: ['invalid_field'],
      };

      const result = service.validateSchema(schema);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Invalid groupBy'))).toBe(true);
    });

    it('should reject limit out of range', () => {
      const schema: ReportSchema = {
        name: 'Test',
        dimensions: ['case_type'],
        measures: ['count'],
        limit: 0,
      };

      const result = service.validateSchema(schema);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Limit'))).toBe(true);
    });

    it('should accept limit within valid range', () => {
      const schema: ReportSchema = {
        name: 'Test',
        dimensions: ['case_type'],
        measures: ['count'],
        limit: 500,
      };

      const result = service.validateSchema(schema);

      expect(result.valid).toBe(true);
    });
  });

  describe('executeReport (FR-113.A2)', () => {
    it('should execute a valid report and return results', async () => {
      mockPrisma.case.groupBy.mockResolvedValue([
        { case_type: 'VALUATION_REQUEST', _count: { id: 10 } },
        { case_type: 'LEGAL_OPINION', _count: { id: 5 } },
      ]);

      const schema: ReportSchema = {
        name: 'Cases by Type',
        dimensions: ['case_type'],
        measures: ['count'],
      };

      const result = await service.executeReport(schema);

      expect(result.schema).toEqual(schema);
      expect(result.rows).toHaveLength(2);
      expect(result.totalRows).toBe(2);
      expect(result.generatedAt).toBeInstanceOf(Date);
    });

    it('should throw on invalid schema', async () => {
      const schema: ReportSchema = {
        name: '',
        dimensions: [],
        measures: [],
      };

      await expect(service.executeReport(schema)).rejects.toThrow('Invalid report schema');
    });

    it('should use groupBy from schema when provided', async () => {
      mockPrisma.case.groupBy.mockResolvedValue([]);

      const schema: ReportSchema = {
        name: 'Grouped Report',
        dimensions: ['case_type', 'priority'],
        measures: ['count'],
        groupBy: ['case_type'],
      };

      await service.executeReport(schema);

      expect(mockPrisma.case.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          by: ['case_type'],
        }),
      );
    });

    it('should apply filters as where clause', async () => {
      mockPrisma.case.groupBy.mockResolvedValue([]);

      const schema: ReportSchema = {
        name: 'Filtered Report',
        dimensions: ['case_type'],
        measures: ['count'],
        filters: {
          status: 'IN_PROGRESS',
          priority: ['HIGH', 'CRITICAL'],
        },
      };

      await service.executeReport(schema);

      expect(mockPrisma.case.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            status: 'IN_PROGRESS',
            priority: { in: ['HIGH', 'CRITICAL'] },
          },
        }),
      );
    });

    it('should apply limit from schema', async () => {
      mockPrisma.case.groupBy.mockResolvedValue([]);

      const schema: ReportSchema = {
        name: 'Limited Report',
        dimensions: ['case_type'],
        measures: ['count'],
        limit: 50,
      };

      await service.executeReport(schema);

      expect(mockPrisma.case.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 50,
        }),
      );
    });

    it('should return empty results on database error', async () => {
      mockPrisma.case.groupBy.mockRejectedValue(new Error('DB error'));

      const schema: ReportSchema = {
        name: 'Error Report',
        dimensions: ['case_type'],
        measures: ['count'],
      };

      const result = await service.executeReport(schema);

      expect(result.rows).toHaveLength(0);
      expect(result.totalRows).toBe(0);
    });

    it('should include count measure in results', async () => {
      mockPrisma.case.groupBy.mockResolvedValue([
        { case_type: 'VALUATION_REQUEST', _count: { id: 25 } },
      ]);

      const schema: ReportSchema = {
        name: 'Count Report',
        dimensions: ['case_type'],
        measures: ['count'],
      };

      const result = await service.executeReport(schema);

      expect(result.rows[0].count).toBe(25);
      expect(result.rows[0].case_type).toBe('VALUATION_REQUEST');
    });
  });

  describe('getAvailableDimensions (FR-113.A1)', () => {
    it('should return a list of valid dimensions', () => {
      const dimensions = service.getAvailableDimensions();

      expect(dimensions).toContain('case_type');
      expect(dimensions).toContain('priority');
      expect(dimensions).toContain('status');
      expect(dimensions).toContain('assigned_fpr_id');
      expect(dimensions).toContain('assigned_vendor_id');
      expect(dimensions).toContain('property_city');
      expect(dimensions.length).toBeGreaterThan(0);
    });

    it('should return a copy, not the original array', () => {
      const dims1 = service.getAvailableDimensions();
      const dims2 = service.getAvailableDimensions();

      expect(dims1).toEqual(dims2);
      expect(dims1).not.toBe(dims2);
    });
  });

  describe('getAvailableMeasures (FR-113.A1)', () => {
    it('should return a list of valid measures', () => {
      const measures = service.getAvailableMeasures();

      expect(measures).toContain('count');
      expect(measures).toContain('avg_tat');
      expect(measures).toContain('breach_rate');
      expect(measures.length).toBeGreaterThan(0);
    });

    it('should return a copy, not the original array', () => {
      const m1 = service.getAvailableMeasures();
      const m2 = service.getAvailableMeasures();

      expect(m1).toEqual(m2);
      expect(m1).not.toBe(m2);
    });
  });
});
