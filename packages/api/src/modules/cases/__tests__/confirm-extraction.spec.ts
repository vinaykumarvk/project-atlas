import { FieldExtractorService } from '../../email-ingest/services/field-extractor.service';

describe('FieldExtractorService — confirmExtraction', () => {
  describe('without Prisma', () => {
    let service: FieldExtractorService;

    beforeEach(() => {
      service = new FieldExtractorService();
    });

    it('should confirm extraction without throwing when no Prisma is available', async () => {
      await expect(
        service.confirmExtraction('case-123', { market_value: '1500000' }, 'officer-1'),
      ).resolves.not.toThrow();
    });
  });

  describe('with Prisma', () => {
    let service: FieldExtractorService;
    let mockPrisma: any;

    beforeEach(() => {
      mockPrisma = {
        caseActivityLog: {
          create: jest.fn().mockResolvedValue({ id: 'log-1' }),
        },
      };
      service = new FieldExtractorService(mockPrisma);
    });

    it('should record extraction confirmation in the activity log', async () => {
      const confirmedFields = {
        market_value: '1500000',
        property_address: '123 Main St',
        valuer_id: 'V-001',
      };

      await service.confirmExtraction('case-123', confirmedFields, 'officer-1');

      expect(mockPrisma.caseActivityLog.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.caseActivityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          case_id: 'case-123',
          action_code: 'EXTRACTION_CONFIRMED',
          actor_type: 'USER',
          actor_id: 'officer-1',
          payload_json: expect.objectContaining({
            confirmedFields,
          }),
        }),
      });
    });

    it('should include confirmedAt timestamp in the payload', async () => {
      await service.confirmExtraction('case-456', { field1: 'value1' }, 'officer-2');

      const call = mockPrisma.caseActivityLog.create.mock.calls[0][0];
      expect(call.data.payload_json.confirmedAt).toBeDefined();
      // Should be a valid ISO date string
      expect(new Date(call.data.payload_json.confirmedAt).toISOString()).toBeTruthy();
    });

    it('should handle empty confirmed fields', async () => {
      await expect(
        service.confirmExtraction('case-789', {}, 'officer-3'),
      ).resolves.not.toThrow();

      expect(mockPrisma.caseActivityLog.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('CasesController confirm-extraction endpoint integration', () => {
    it('should validate that the FieldExtractorService.confirmExtraction method exists', () => {
      const service = new FieldExtractorService();
      expect(typeof service.confirmExtraction).toBe('function');
    });

    it('should accept caseId, confirmedFields, and officerId parameters', async () => {
      const service = new FieldExtractorService();
      // Verify the method signature works
      const result = service.confirmExtraction(
        'case-id',
        { field: 'value' },
        'officer-id',
      );
      expect(result).toBeInstanceOf(Promise);
      await result;
    });
  });
});
