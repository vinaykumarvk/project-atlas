import { ODataController } from '../controllers/odata.controller';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';

describe('ODataController (FR-113.A3)', () => {
  let controller: ODataController;
  let prisma: ReturnType<typeof createMockPrismaService>;

  beforeEach(() => {
    prisma = createMockPrismaService();
    controller = new ODataController(prisma as any);
  });

  describe('parseFilter', () => {
    it('should return empty where clause when no filter provided', () => {
      const result = controller.parseFilter(undefined);
      expect(result).toEqual({});
    });

    it('should parse simple eq filter', () => {
      const result = controller.parseFilter("status eq 'IN_PROGRESS'");
      expect(result).toEqual({ status: 'IN_PROGRESS' });
    });

    it('should map caseType to case_type', () => {
      const result = controller.parseFilter("caseType eq 'VALUATION'");
      expect(result).toEqual({ case_type: 'VALUATION' });
    });
  });

  describe('parseOrderBy', () => {
    it('should default to created_at desc when no orderby provided', () => {
      const result = controller.parseOrderBy(undefined);
      expect(result).toEqual({ created_at: 'desc' });
    });

    it('should parse field and direction', () => {
      const result = controller.parseOrderBy('createdAt asc');
      expect(result).toEqual({ created_at: 'asc' });
    });
  });

  describe('parseSelect', () => {
    it('should return undefined when no select provided', () => {
      const result = controller.parseSelect(undefined);
      expect(result).toBeUndefined();
    });

    it('should always include id in select', () => {
      const result = controller.parseSelect('status,priority');
      expect(result.id).toBe(true);
      expect(result.status).toBe(true);
      expect(result.priority).toBe(true);
    });
  });

  describe('queryCases', () => {
    it('should return OData v4 formatted response', async () => {
      const mockCases = [
        {
          id: 'c1',
          case_number: 'CASE-001',
          case_type: 'VALUATION',
          status: 'NEW',
          priority: 'P1',
          created_at: new Date('2026-04-01'),
          updated_at: new Date('2026-04-01'),
        },
      ];
      (prisma.case.findMany as jest.Mock).mockResolvedValue(mockCases);
      (prisma.case.count as jest.Mock).mockResolvedValue(1);

      const result = await controller.queryCases(undefined, undefined, undefined, '10', '0');
      expect(result['@odata.context']).toBe('$metadata#Cases');
      expect(result['@odata.count']).toBe(1);
      expect(result.value).toHaveLength(1);
      expect(result.value[0].caseNumber).toBe('CASE-001');
    });

    it('should respect $top and $skip parameters', async () => {
      (prisma.case.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.case.count as jest.Mock).mockResolvedValue(0);

      await controller.queryCases(undefined, undefined, undefined, '5', '10');

      expect(prisma.case.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 5,
          skip: 10,
        }),
      );
    });
  });
});
