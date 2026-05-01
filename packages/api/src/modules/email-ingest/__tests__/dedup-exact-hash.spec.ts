import { DedupDetectorService } from '../services/dedup-detector.service';

describe('DedupDetectorService — Exact Hash (FR-014.A1)', () => {
  let service: DedupDetectorService;

  beforeEach(() => {
    service = new DedupDetectorService();
  });

  it('should detect exact duplicate via SHA-256 before SimHash', () => {
    const text = 'This is a test email body for deduplication';
    service.checkDuplicate('email-1', text);
    const result = service.checkDuplicate('email-2', text);
    expect(result.isDuplicate).toBe(true);
    expect(result.method).toBe('EXACT');
    expect(result.similarity).toBe(1.0);
    expect(result.matchedId).toBe('email-1');
  });

  it('should not flag different content as exact duplicate', () => {
    service.checkDuplicate('email-1', 'First email content');
    const result = service.checkDuplicate('email-2', 'Completely different content');
    // May or may not be SimHash duplicate, but should not be EXACT
    if (result.isDuplicate) {
      expect(result.method).not.toBe('EXACT');
    }
  });

  it('should compute consistent SHA-256 hashes', () => {
    const text = 'Hello world';
    const hash1 = service.computeSha256(text);
    const hash2 = service.computeSha256(text);
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('should clear exact hash store along with simhash store', () => {
    service.checkDuplicate('email-1', 'Some content');
    service.clear();
    const result = service.checkDuplicate('email-2', 'Some content');
    expect(result.isDuplicate).toBe(false);
  });
});
