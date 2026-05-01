import { ProviderHealthService } from '../provider-health.service';

describe('ProviderHealthService', () => {
  let service: ProviderHealthService;

  beforeEach(() => {
    service = new ProviderHealthService();
  });

  it('should return detailed health report', async () => {
    const report = await service.getDetailedHealth();
    expect(report).toHaveProperty('metrics');
    expect(report).toHaveProperty('queues');
    expect(report).toHaveProperty('errors');
    expect(report).toHaveProperty('lastUpdated');
  });

  it('should include database health metric', async () => {
    const report = await service.getDetailedHealth();
    const db = report.metrics.find((m) => m.provider === 'database:postgres');
    expect(db).toBeDefined();
    expect(db!.status).toBe('healthy');
  });

  it('should include redis health metric', async () => {
    const report = await service.getDetailedHealth();
    const redis = report.metrics.find((m) => m.provider === 'cache:redis');
    expect(redis).toBeDefined();
    expect(redis!.status).toBe('healthy');
  });

  it('should include S3 health metric', async () => {
    const report = await service.getDetailedHealth();
    const s3 = report.metrics.find((m) => m.provider === 'storage:s3');
    expect(s3).toBeDefined();
    expect(s3!.status).toBe('healthy');
  });

  it('should include notification channels', async () => {
    const report = await service.getDetailedHealth();
    const emailNotif = report.metrics.find((m) => m.provider === 'notification:email');
    expect(emailNotif).toBeDefined();
    expect(emailNotif!.status).toBe('healthy');
  });

  it('should include queue metrics', async () => {
    const report = await service.getDetailedHealth();
    expect(report.queues.length).toBeGreaterThan(0);
    expect(report.queues[0]).toHaveProperty('name');
    expect(report.queues[0]).toHaveProperty('pending');
  });

  it('should map LLM mode ON to healthy', async () => {
    const mockPipeline = { getEffectiveMode: () => 'ON' as const };
    const svc = new ProviderHealthService(undefined, mockPipeline as any);
    const report = await svc.getDetailedHealth();
    const llm = report.metrics.find((m) => m.provider === 'llm');
    expect(llm).toBeDefined();
    expect(llm!.status).toBe('healthy');
  });

  it('should map LLM mode DEGRADED to degraded', async () => {
    const mockPipeline = { getEffectiveMode: () => 'DEGRADED' as const };
    const svc = new ProviderHealthService(undefined, mockPipeline as any);
    const report = await svc.getDetailedHealth();
    const llm = report.metrics.find((m) => m.provider === 'llm');
    expect(llm!.status).toBe('degraded');
  });
});
