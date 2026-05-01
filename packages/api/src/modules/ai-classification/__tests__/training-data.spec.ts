import { TrainingDataService } from '../services/training-data.service';

describe('TrainingDataService', () => {
  let service: TrainingDataService;

  beforeEach(() => {
    service = new TrainingDataService();
  });

  describe('recordCorrection()', () => {
    it('should record a correction with timestamp', () => {
      service.recordCorrection({
        emailId: 'email-1',
        originalLabel: 'VALUATION_REQUEST',
        correctedLabel: 'LEGAL_OPINION',
        correctedBy: 'user-1',
        features: { wordCount: 150 },
      });

      const corrections = service.getCorrections();
      expect(corrections).toHaveLength(1);
      expect(corrections[0].emailId).toBe('email-1');
      expect(corrections[0].originalLabel).toBe('VALUATION_REQUEST');
      expect(corrections[0].correctedLabel).toBe('LEGAL_OPINION');
      expect(corrections[0].correctedBy).toBe('user-1');
      expect(corrections[0].correctedAt).toBeInstanceOf(Date);
    });

    it('should accumulate multiple corrections', () => {
      service.recordCorrection({
        emailId: 'email-1',
        originalLabel: 'A',
        correctedLabel: 'B',
        correctedBy: 'user-1',
        features: {},
      });
      service.recordCorrection({
        emailId: 'email-2',
        originalLabel: 'C',
        correctedLabel: 'D',
        correctedBy: 'user-2',
        features: {},
      });

      expect(service.getCorrectionCount()).toBe(2);
    });
  });

  describe('getCorrections()', () => {
    it('should return all corrections when no limit is specified', () => {
      for (let i = 0; i < 5; i++) {
        service.recordCorrection({
          emailId: `email-${i}`,
          originalLabel: 'A',
          correctedLabel: 'B',
          correctedBy: 'user',
          features: {},
        });
      }

      expect(service.getCorrections()).toHaveLength(5);
    });

    it('should return limited corrections when limit is specified', () => {
      for (let i = 0; i < 10; i++) {
        service.recordCorrection({
          emailId: `email-${i}`,
          originalLabel: 'A',
          correctedLabel: 'B',
          correctedBy: 'user',
          features: {},
        });
      }

      const limited = service.getCorrections(3);
      expect(limited).toHaveLength(3);
    });

    it('should return the most recent corrections when limited', () => {
      for (let i = 0; i < 5; i++) {
        service.recordCorrection({
          emailId: `email-${i}`,
          originalLabel: 'A',
          correctedLabel: 'B',
          correctedBy: 'user',
          features: { index: i },
        });
      }

      const limited = service.getCorrections(2);
      // Should be the last 2 (most recent)
      expect(limited[0].features).toEqual({ index: 3 });
      expect(limited[1].features).toEqual({ index: 4 });
    });

    it('should return empty array when no corrections exist', () => {
      expect(service.getCorrections()).toEqual([]);
    });
  });

  describe('exportAsJsonl()', () => {
    it('should export corrections as JSONL format', () => {
      service.recordCorrection({
        emailId: 'email-1',
        originalLabel: 'A',
        correctedLabel: 'B',
        correctedBy: 'user-1',
        features: { key: 'value' },
      });
      service.recordCorrection({
        emailId: 'email-2',
        originalLabel: 'C',
        correctedLabel: 'D',
        correctedBy: 'user-2',
        features: {},
      });

      const jsonl = service.exportAsJsonl();
      const lines = jsonl.split('\n');
      expect(lines).toHaveLength(2);

      const parsed0 = JSON.parse(lines[0]);
      expect(parsed0.emailId).toBe('email-1');
      expect(parsed0.correctedLabel).toBe('B');

      const parsed1 = JSON.parse(lines[1]);
      expect(parsed1.emailId).toBe('email-2');
    });

    it('should return empty string when no corrections exist', () => {
      expect(service.exportAsJsonl()).toBe('');
    });
  });

  describe('getCorrectionCount()', () => {
    it('should return 0 initially', () => {
      expect(service.getCorrectionCount()).toBe(0);
    });

    it('should return correct count after recording', () => {
      service.recordCorrection({
        emailId: 'e1',
        originalLabel: 'A',
        correctedLabel: 'B',
        correctedBy: 'u',
        features: {},
      });
      expect(service.getCorrectionCount()).toBe(1);
    });
  });

  describe('clearExported()', () => {
    it('should clear all corrections', () => {
      service.recordCorrection({
        emailId: 'e1',
        originalLabel: 'A',
        correctedLabel: 'B',
        correctedBy: 'u',
        features: {},
      });

      service.clearExported();
      expect(service.getCorrectionCount()).toBe(0);
      expect(service.getCorrections()).toEqual([]);
    });
  });

  describe('shouldTriggerRetraining()', () => {
    it('should return false when below default threshold (100)', () => {
      for (let i = 0; i < 50; i++) {
        service.recordCorrection({
          emailId: `e-${i}`,
          originalLabel: 'A',
          correctedLabel: 'B',
          correctedBy: 'u',
          features: {},
        });
      }

      expect(service.shouldTriggerRetraining()).toBe(false);
    });

    it('should return true when at or above default threshold', () => {
      for (let i = 0; i < 100; i++) {
        service.recordCorrection({
          emailId: `e-${i}`,
          originalLabel: 'A',
          correctedLabel: 'B',
          correctedBy: 'u',
          features: {},
        });
      }

      expect(service.shouldTriggerRetraining()).toBe(true);
    });

    it('should use custom threshold when provided', () => {
      for (let i = 0; i < 10; i++) {
        service.recordCorrection({
          emailId: `e-${i}`,
          originalLabel: 'A',
          correctedLabel: 'B',
          correctedBy: 'u',
          features: {},
        });
      }

      expect(service.shouldTriggerRetraining(10)).toBe(true);
      expect(service.shouldTriggerRetraining(11)).toBe(false);
    });
  });

  describe('getRetrainingStatus()', () => {
    it('should return correct status when not ready', () => {
      const status = service.getRetrainingStatus();
      expect(status).toEqual({
        correctionCount: 0,
        threshold: 100,
        ready: false,
      });
    });

    it('should return ready=true when threshold is met', () => {
      for (let i = 0; i < 100; i++) {
        service.recordCorrection({
          emailId: `e-${i}`,
          originalLabel: 'A',
          correctedLabel: 'B',
          correctedBy: 'u',
          features: {},
        });
      }

      const status = service.getRetrainingStatus();
      expect(status.ready).toBe(true);
      expect(status.correctionCount).toBe(100);
      expect(status.threshold).toBe(100);
    });

    it('should use custom threshold', () => {
      for (let i = 0; i < 5; i++) {
        service.recordCorrection({
          emailId: `e-${i}`,
          originalLabel: 'A',
          correctedLabel: 'B',
          correctedBy: 'u',
          features: {},
        });
      }

      const status = service.getRetrainingStatus(5);
      expect(status).toEqual({
        correctionCount: 5,
        threshold: 5,
        ready: true,
      });
    });
  });
});
