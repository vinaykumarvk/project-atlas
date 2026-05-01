import { OcrService, OcrResult } from '../services/ocr.service';

describe('OcrService — wordConfidences', () => {
  let service: OcrService;
  let mockPrisma: any;
  let mockConfig: any;
  let mockDocClassifier: any;
  let mockFieldExtractor: any;

  beforeEach(() => {
    mockPrisma = {
      caseAttachment: {
        update: jest.fn().mockResolvedValue({}),
      },
    };
    mockConfig = {
      get: jest.fn().mockReturnValue('true'),
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

    service = new OcrService(
      mockPrisma,
      mockConfig,
      mockDocClassifier,
      mockFieldExtractor,
    );
  });

  describe('OcrResult interface', () => {
    it('should include wordConfidences array in the result type', async () => {
      // Use a text/plain buffer which will be directly extracted
      const buffer = Buffer.from('Hello World Test Document');
      const result = await service.processAttachment(
        'attachment-1',
        buffer,
        'text/plain',
        'test.txt',
      );

      expect(result).toHaveProperty('wordConfidences');
      expect(Array.isArray(result.wordConfidences)).toBe(true);
    });
  });

  describe('wordConfidences population', () => {
    it('should populate wordConfidences for text/plain documents', async () => {
      const buffer = Buffer.from('Hello World Test');
      const result = await service.processAttachment(
        'attachment-1',
        buffer,
        'text/plain',
        'test.txt',
      );

      expect(result.wordConfidences.length).toBeGreaterThan(0);
      expect(result.wordConfidences[0]).toHaveProperty('word');
      expect(result.wordConfidences[0]).toHaveProperty('confidence');
    });

    it('should have word and confidence for each word in text', async () => {
      const buffer = Buffer.from('The quick brown fox');
      const result = await service.processAttachment(
        'attachment-1',
        buffer,
        'text/plain',
        'test.txt',
      );

      const words = result.wordConfidences.map((wc) => wc.word);
      expect(words).toContain('The');
      expect(words).toContain('quick');
      expect(words).toContain('brown');
      expect(words).toContain('fox');
    });

    it('should return confidence values between 0 and 1', async () => {
      const buffer = Buffer.from('Market Value: 1500000 INR');
      const result = await service.processAttachment(
        'attachment-1',
        buffer,
        'text/plain',
        'test.txt',
      );

      for (const wc of result.wordConfidences) {
        expect(wc.confidence).toBeGreaterThanOrEqual(0);
        expect(wc.confidence).toBeLessThanOrEqual(1);
      }
    });

    it('should return empty wordConfidences when OCR produces no text', async () => {
      // Disable OCR
      mockConfig.get.mockReturnValue('false');
      service = new OcrService(
        mockPrisma,
        mockConfig,
        mockDocClassifier,
        mockFieldExtractor,
      );

      const buffer = Buffer.from('some content');
      const result = await service.processAttachment(
        'attachment-1',
        buffer,
        'application/pdf',
        'test.pdf',
      );

      expect(result.wordConfidences).toEqual([]);
    });

    it('should assign lower confidence to short words', async () => {
      const buffer = Buffer.from('A test of the OCR word confidence system');
      const result = await service.processAttachment(
        'attachment-1',
        buffer,
        'text/plain',
        'test.txt',
      );

      const shortWordConf = result.wordConfidences.find((wc) => wc.word === 'A');
      const longWordConf = result.wordConfidences.find((wc) => wc.word === 'confidence');

      if (shortWordConf && longWordConf) {
        // Short words should have equal or lower confidence
        expect(shortWordConf.confidence).toBeLessThanOrEqual(longWordConf.confidence);
      }
    });

    it('should handle single word text', async () => {
      const buffer = Buffer.from('Hello');
      const result = await service.processAttachment(
        'attachment-1',
        buffer,
        'text/plain',
        'test.txt',
      );

      expect(result.wordConfidences).toHaveLength(1);
      expect(result.wordConfidences[0].word).toBe('Hello');
    });
  });

  describe('processAttachment return shape', () => {
    it('should return all required OcrResult fields', async () => {
      const buffer = Buffer.from('Test document content');
      const result = await service.processAttachment(
        'attachment-1',
        buffer,
        'text/plain',
        'test.txt',
      );

      expect(result).toHaveProperty('text');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('method');
      expect(result).toHaveProperty('wordConfidences');
      expect(typeof result.text).toBe('string');
      expect(typeof result.confidence).toBe('number');
      expect(typeof result.method).toBe('string');
      expect(Array.isArray(result.wordConfidences)).toBe(true);
    });
  });
});
