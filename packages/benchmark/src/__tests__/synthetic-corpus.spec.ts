import { SyntheticCorpusService } from '../generator/synthetic-corpus.service';

describe('SyntheticCorpusService', () => {
  let service: SyntheticCorpusService;

  beforeEach(() => {
    service = new SyntheticCorpusService();
  });

  it('should generate the requested number of emails', () => {
    const emails = service.generate(20);
    expect(emails).toHaveLength(20);
  });

  it('should distribute across case types', () => {
    const emails = service.generate(12);
    const types = new Set(emails.map(e => e.caseType));
    expect(types.size).toBeGreaterThan(1);
  });

  it('should include ground truth labels', () => {
    const emails = service.generate(5);
    for (const email of emails) {
      expect(email.groundTruthLabel).toBeTruthy();
      expect(email.groundTruthLabel).toBe(email.caseType);
    }
  });

  it('should generate emails with realistic content', () => {
    const emails = service.generate(3);
    for (const email of emails) {
      expect(email.subject.length).toBeGreaterThan(10);
      expect(email.body.length).toBeGreaterThan(50);
    }
  });

  it('should support filtering by case types', () => {
    const emails = service.generate(10, { caseTypes: ['VALUATION'] });
    for (const email of emails) {
      expect(email.caseType).toBe('VALUATION');
    }
  });

  it('should sign corpus with SHA-256 hash', () => {
    const emails = service.generate(5);
    const signature = service.signCorpus(emails);
    expect(signature.corpusHash).toHaveLength(64);
    expect(signature.emailCount).toBe(5);
    expect(signature.version).toMatch(/^v\d{4}\.\d{2}\.\d{2}$/);
  });

  it('should produce consistent signatures for same corpus', () => {
    const emails = service.generate(5);
    const sig1 = service.signCorpus(emails);
    const sig2 = service.signCorpus(emails);
    expect(sig1.corpusHash).toBe(sig2.corpusHash);
  });
});
