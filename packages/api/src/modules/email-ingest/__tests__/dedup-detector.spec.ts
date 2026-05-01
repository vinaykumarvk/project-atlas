import { DedupDetectorService, DedupResult } from '../services/dedup-detector.service';

describe('DedupDetectorService', () => {
  let service: DedupDetectorService;

  beforeEach(() => {
    service = new DedupDetectorService();
  });

  afterEach(() => {
    service.clear();
  });

  describe('computeSimHash', () => {
    it('should return a bigint hash', () => {
      const hash = service.computeSimHash('hello world');
      expect(typeof hash).toBe('bigint');
    });

    it('should return the same hash for the same text', () => {
      const hash1 = service.computeSimHash('hello world test document');
      const hash2 = service.computeSimHash('hello world test document');
      expect(hash1).toBe(hash2);
    });

    it('should return different hashes for very different texts', () => {
      const hash1 = service.computeSimHash('the quick brown fox jumps over the lazy dog');
      const hash2 = service.computeSimHash('completely unrelated text about quantum physics and chemistry');
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty text', () => {
      const hash = service.computeSimHash('');
      expect(typeof hash).toBe('bigint');
      expect(hash).toBe(0n);
    });

    it('should handle single word', () => {
      const hash = service.computeSimHash('hello');
      expect(typeof hash).toBe('bigint');
    });
  });

  describe('hammingDistance', () => {
    it('should return 0 for identical hashes', () => {
      const dist = service.hammingDistance(0n, 0n);
      expect(dist).toBe(0);
    });

    it('should return the correct distance for known values', () => {
      // 0b1010 vs 0b1001 -> 2 bits differ (bit 0 and bit 1)
      const dist = service.hammingDistance(0b1010n, 0b1001n);
      expect(dist).toBe(2);
    });

    it('should return 1 for single bit difference', () => {
      const dist = service.hammingDistance(0b0000n, 0b0001n);
      expect(dist).toBe(1);
    });

    it('should be symmetric', () => {
      const a = 123456n;
      const b = 654321n;
      expect(service.hammingDistance(a, b)).toBe(service.hammingDistance(b, a));
    });
  });

  describe('similarity', () => {
    it('should return 1.0 for identical hashes', () => {
      const sim = service.similarity(42n, 42n);
      expect(sim).toBe(1);
    });

    it('should return a value between 0 and 1', () => {
      const sim = service.similarity(123n, 456n);
      expect(sim).toBeGreaterThanOrEqual(0);
      expect(sim).toBeLessThanOrEqual(1);
    });

    it('should return high similarity for similar hashes', () => {
      const text1 = 'the quick brown fox jumps over the lazy dog';
      const text2 = 'the quick brown fox jumps over the lazy cat';
      const hash1 = service.computeSimHash(text1);
      const hash2 = service.computeSimHash(text2);
      const sim = service.similarity(hash1, hash2);
      expect(sim).toBeGreaterThan(0.7);
    });
  });

  describe('checkDuplicate', () => {
    it('should return isDuplicate=false for the first document', () => {
      const result = service.checkDuplicate('doc1', 'This is the first document about banking operations');
      expect(result.isDuplicate).toBe(false);
      expect(result.method).toBe('NONE');
    });

    it('should store the document hash after checking', () => {
      service.checkDuplicate('doc1', 'Some document text about financial services');
      expect(service.getStoredCount()).toBe(1);
    });

    it('should detect exact duplicate text', () => {
      const text = 'This is a test document about loan processing and verification steps in banking';
      service.checkDuplicate('doc1', text);
      const result = service.checkDuplicate('doc2', text);
      expect(result.isDuplicate).toBe(true);
      expect(result.similarity).toBe(1);
      expect(result.matchedId).toBe('doc1');
      expect(result.method).toBe('EXACT');
    });

    it('should detect near-duplicate text', () => {
      const text1 = 'Dear Sir, I am writing to request a loan modification for account number 12345. The current terms are unfavorable and I need adjustment.';
      const text2 = 'Dear Sir, I am writing to request a loan modification for account number 12345. The current terms are unfavorable and I need some adjustment.';
      service.checkDuplicate('doc1', text1);
      const result = service.checkDuplicate('doc2', text2);
      expect(result.isDuplicate).toBe(true);
      expect(result.similarity).toBeGreaterThanOrEqual(0.9);
    });

    it('should not flag very different texts as duplicates', () => {
      service.checkDuplicate('doc1', 'Application for home loan of fifty lakhs rupees for property in Mumbai Maharashtra');
      const result = service.checkDuplicate('doc2', 'Legal notice regarding breach of contract in commercial real estate transaction in Delhi');
      expect(result.isDuplicate).toBe(false);
    });

    it('should return the matchedId of the duplicate', () => {
      const text = 'Processing email about account verification steps and compliance requirements for new customers';
      service.checkDuplicate('original-123', text);
      const result = service.checkDuplicate('copy-456', text);
      expect(result.matchedId).toBe('original-123');
    });
  });

  describe('clear', () => {
    it('should remove all stored hashes', () => {
      service.checkDuplicate('doc1', 'First document');
      service.checkDuplicate('doc2', 'Second document');
      expect(service.getStoredCount()).toBe(2);

      service.clear();
      expect(service.getStoredCount()).toBe(0);
    });
  });

  describe('getStoredCount', () => {
    it('should return 0 initially', () => {
      expect(service.getStoredCount()).toBe(0);
    });

    it('should increment when new documents are added', () => {
      service.checkDuplicate('doc1', 'First unique document about banking');
      expect(service.getStoredCount()).toBe(1);
      service.checkDuplicate('doc2', 'Second completely different document about insurance');
      expect(service.getStoredCount()).toBe(2);
    });

    it('should not increment when a duplicate is found', () => {
      const text = 'Duplicate document about mortgage application and verification requirements';
      service.checkDuplicate('doc1', text);
      expect(service.getStoredCount()).toBe(1);
      service.checkDuplicate('doc2', text);
      // doc2 is a duplicate, so it should not be stored
      expect(service.getStoredCount()).toBe(1);
    });
  });
});
