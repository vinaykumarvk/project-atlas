import { OcrService } from '../services/ocr.service';

describe('OcrService — OCR_REGION data-residency routing', () => {
  let mockPrisma: any;
  let mockDocClassifier: any;
  let mockFieldExtractor: any;

  beforeEach(() => {
    mockPrisma = {
      caseAttachment: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    mockDocClassifier = {
      classify: jest.fn().mockReturnValue({
        documentType: 'OTHER',
        confidence: 0.5,
      }),
    };
    mockFieldExtractor = {
      extract: jest.fn().mockReturnValue({}),
    };
  });

  function createService(ocrRegion?: string): OcrService {
    const mockConfig = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'OCR_ENABLED') return 'true';
        if (key === 'OCR_REGION') return ocrRegion || undefined;
        return defaultValue;
      }),
    };
    return new OcrService(mockPrisma, mockConfig as any, mockDocClassifier, mockFieldExtractor);
  }

  describe('getRegion', () => {
    it('should return the configured OCR region', () => {
      const service = createService('eu-west-1');
      expect(service.getRegion()).toBe('eu-west-1');
    });

    it('should default to us-east-1 when OCR_REGION is not set', () => {
      const service = createService(undefined);
      expect(service.getRegion()).toBe('us-east-1');
    });

    it('should return ap-south-1 for Indian data residency', () => {
      const service = createService('ap-south-1');
      expect(service.getRegion()).toBe('ap-south-1');
    });

    it('should return eu-central-1 for EU data residency', () => {
      const service = createService('eu-central-1');
      expect(service.getRegion()).toBe('eu-central-1');
    });
  });

  describe('getEndpoint', () => {
    it('should return a region-specific endpoint for us-east-1', () => {
      const service = createService('us-east-1');
      expect(service.getEndpoint()).toBe('https://ocr.us-east-1.atlas.internal/v1');
    });

    it('should return a region-specific endpoint for eu-west-1', () => {
      const service = createService('eu-west-1');
      expect(service.getEndpoint()).toBe('https://ocr.eu-west-1.atlas.internal/v1');
    });

    it('should return a region-specific endpoint for ap-south-1', () => {
      const service = createService('ap-south-1');
      expect(service.getEndpoint()).toBe('https://ocr.ap-south-1.atlas.internal/v1');
    });

    it('should return a region-specific endpoint for ap-southeast-1', () => {
      const service = createService('ap-southeast-1');
      expect(service.getEndpoint()).toBe('https://ocr.ap-southeast-1.atlas.internal/v1');
    });

    it('should return a region-specific endpoint for us-west-2', () => {
      const service = createService('us-west-2');
      expect(service.getEndpoint()).toBe('https://ocr.us-west-2.atlas.internal/v1');
    });

    it('should return a region-specific endpoint for eu-central-1', () => {
      const service = createService('eu-central-1');
      expect(service.getEndpoint()).toBe('https://ocr.eu-central-1.atlas.internal/v1');
    });

    it('should fall back to default region endpoint for unknown regions', () => {
      const service = createService('unknown-region-99');
      expect(service.getEndpoint()).toBe('https://ocr.us-east-1.atlas.internal/v1');
    });

    it('should fall back to default region endpoint when no region is configured', () => {
      const service = createService(undefined);
      expect(service.getEndpoint()).toBe('https://ocr.us-east-1.atlas.internal/v1');
    });
  });

  describe('processAttachment with region logging', () => {
    it('should process attachments with region context', async () => {
      const service = createService('ap-south-1');
      const buffer = Buffer.from('Sample text content');
      const result = await service.processAttachment('att-1', buffer, 'text/plain', 'doc.txt');

      expect(result.text).toBe('Sample text content');
      expect(service.getRegion()).toBe('ap-south-1');
      expect(service.getEndpoint()).toBe('https://ocr.ap-south-1.atlas.internal/v1');
    });
  });
});
