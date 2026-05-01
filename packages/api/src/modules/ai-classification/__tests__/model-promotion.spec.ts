import { ModelPromotionService } from '../services/model-promotion.service';

describe('ModelPromotionService', () => {
  let service: ModelPromotionService;

  beforeEach(() => {
    service = new ModelPromotionService();
  });

  describe('promote()', () => {
    it('should promote a new version to production', async () => {
      const result = await service.promote('1.0.0', 'admin');

      expect(result.version).toBe('1.0.0');
      expect(result.status).toBe('PROMOTED');
      expect(result.promotedBy).toBe('admin');
      expect(result.promotedAt).toBeInstanceOf(Date);
    });

    it('should demote previous production version when promoting new one', async () => {
      await service.promote('1.0.0', 'admin');
      await service.promote('2.0.0', 'admin');

      const v1 = service.getVersion('1.0.0');
      expect(v1!.status).toBe('ROLLED_BACK');

      const v2 = service.getVersion('2.0.0');
      expect(v2!.status).toBe('PROMOTED');
    });

    it('should pass validation gate when accuracy meets threshold', async () => {
      service.registerCandidate('1.0.0', 0.92);

      const result = await service.promote('1.0.0', 'admin', {
        minAccuracy: 0.9,
      });

      expect(result.status).toBe('PROMOTED');
    });

    it('should fail validation gate when accuracy is below threshold', async () => {
      service.registerCandidate('1.0.0', 0.85);

      await expect(
        service.promote('1.0.0', 'admin', { minAccuracy: 0.9 }),
      ).rejects.toThrow('does not meet the minimum accuracy threshold');
    });

    it('should fail validation gate when accuracy is unknown', async () => {
      await expect(
        service.promote('new-version', 'admin', { minAccuracy: 0.9 }),
      ).rejects.toThrow('does not meet the minimum accuracy threshold');
    });

    it('should not demote itself when re-promoting the same version', async () => {
      await service.promote('1.0.0', 'admin');
      await service.promote('1.0.0', 'admin2');

      const v = service.getVersion('1.0.0');
      expect(v!.status).toBe('PROMOTED');
      expect(v!.promotedBy).toBe('admin2');
    });
  });

  describe('getVersion()', () => {
    it('should return undefined for non-existent version', () => {
      expect(service.getVersion('999.0.0')).toBeUndefined();
    });

    it('should return the version after registration', () => {
      service.registerCandidate('1.0.0', 0.88);
      const v = service.getVersion('1.0.0');
      expect(v).toBeDefined();
      expect(v!.accuracy).toBe(0.88);
      expect(v!.status).toBe('CANDIDATE');
    });
  });

  describe('getCurrentProduction()', () => {
    it('should return undefined when no version is promoted', () => {
      expect(service.getCurrentProduction()).toBeUndefined();
    });

    it('should return the currently promoted version', async () => {
      await service.promote('1.0.0', 'admin');
      const current = service.getCurrentProduction();
      expect(current).toBeDefined();
      expect(current!.version).toBe('1.0.0');
      expect(current!.status).toBe('PROMOTED');
    });

    it('should return latest promoted version after multiple promotions', async () => {
      await service.promote('1.0.0', 'admin');
      await service.promote('2.0.0', 'admin');

      const current = service.getCurrentProduction();
      expect(current!.version).toBe('2.0.0');
    });
  });

  describe('getHistory()', () => {
    it('should return empty array when no versions exist', () => {
      expect(service.getHistory()).toEqual([]);
    });

    it('should return all versions sorted by promotedAt descending', async () => {
      await service.promote('1.0.0', 'admin');
      await new Promise((r) => setTimeout(r, 10));
      await service.promote('2.0.0', 'admin');

      const history = service.getHistory();
      expect(history).toHaveLength(2);
      // Most recently promoted should be first
      expect(history[0].version).toBe('2.0.0');
    });

    it('should include candidates in history (sorted last due to no promotedAt)', () => {
      service.registerCandidate('3.0.0', 0.95);
      const history = service.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0].version).toBe('3.0.0');
      expect(history[0].status).toBe('CANDIDATE');
    });
  });

  describe('registerCandidate()', () => {
    it('should register a candidate with accuracy', () => {
      const v = service.registerCandidate('1.5.0', 0.91);
      expect(v.version).toBe('1.5.0');
      expect(v.status).toBe('CANDIDATE');
      expect(v.accuracy).toBe(0.91);
    });
  });
});
