import { PagerDutyService } from '../services/pagerduty.service';

describe('PagerDutyService', () => {
  function createService(env: Record<string, string> = {}) {
    const mockConfigService = {
      get: jest.fn((key: string) => env[key] ?? undefined),
    };
    return new PagerDutyService(mockConfigService as any);
  }

  describe('isConfigured', () => {
    it('should return false when no API key or service ID is set', () => {
      const service = createService();
      expect(service.isConfigured()).toBe(false);
    });

    it('should return false when only API key is set', () => {
      const service = createService({ PAGERDUTY_API_KEY: 'test-key' });
      expect(service.isConfigured()).toBe(false);
    });

    it('should return false when only service ID is set', () => {
      const service = createService({ PAGERDUTY_SERVICE_ID: 'svc-123' });
      expect(service.isConfigured()).toBe(false);
    });

    it('should return true when both API key and service ID are set', () => {
      const service = createService({
        PAGERDUTY_API_KEY: 'test-key',
        PAGERDUTY_SERVICE_ID: 'svc-123',
      });
      expect(service.isConfigured()).toBe(true);
    });
  });

  describe('createIncident', () => {
    it('should create an incident and return an ID', async () => {
      const service = createService();
      const result = await service.createIncident(
        'Test incident',
        'critical',
      );

      expect(result.incidentId).toBeDefined();
      expect(result.status).toBe('triggered');
    });

    it('should accept optional details', async () => {
      const service = createService();
      const result = await service.createIncident(
        'Test incident',
        'error',
        { customField: 'value' },
      );

      expect(result.incidentId).toBeDefined();
      expect(result.status).toBe('triggered');
    });

    it('should support all severity levels', async () => {
      const service = createService();
      const severities: Array<'critical' | 'error' | 'warning' | 'info'> = [
        'critical',
        'error',
        'warning',
        'info',
      ];

      for (const severity of severities) {
        const result = await service.createIncident(
          `${severity} incident`,
          severity,
        );
        expect(result.incidentId).toBeDefined();
      }
    });

    it('should store incidents for retrieval', async () => {
      const service = createService();
      await service.createIncident('Incident 1', 'critical');
      await service.createIncident('Incident 2', 'warning');

      const incidents = service.getIncidents();
      expect(incidents).toHaveLength(2);
      expect(incidents[0].title).toBe('Incident 1');
      expect(incidents[1].title).toBe('Incident 2');
    });
  });

  describe('resolveIncident', () => {
    it('should resolve an existing incident', async () => {
      const service = createService();
      const { incidentId } = await service.createIncident(
        'Resolve me',
        'error',
      );

      const resolved = await service.resolveIncident(incidentId);
      expect(resolved).toBe(true);
    });

    it('should return false for non-existent incident', async () => {
      const service = createService();
      const resolved = await service.resolveIncident('non-existent-id');
      expect(resolved).toBe(false);
    });
  });

  describe('getIncidents', () => {
    it('should return empty array initially', () => {
      const service = createService();
      expect(service.getIncidents()).toHaveLength(0);
    });

    it('should return incidents with correct structure', async () => {
      const service = createService();
      await service.createIncident('Test', 'critical');

      const incidents = service.getIncidents();
      expect(incidents[0]).toHaveProperty('id');
      expect(incidents[0]).toHaveProperty('title', 'Test');
      expect(incidents[0]).toHaveProperty('severity', 'critical');
      expect(incidents[0]).toHaveProperty('createdAt');
      expect(incidents[0].createdAt).toBeInstanceOf(Date);
    });
  });
});
