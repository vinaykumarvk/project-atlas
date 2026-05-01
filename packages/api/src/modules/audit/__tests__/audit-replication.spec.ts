import { AuditReplicationService } from '../services/audit-replication.service';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';

describe('AuditReplicationService (FR-126.A3)', () => {
  let service: AuditReplicationService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;
  const originalEnv = process.env;

  beforeEach(() => {
    mockPrisma = createMockPrismaService();
    service = new AuditReplicationService(mockPrisma);
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('replicateToS3', () => {
    it('should return replicatedCount matching input entries', async () => {
      const entries = [
        { id: '1', event_code: 'TEST', created_at: new Date() },
        { id: '2', event_code: 'TEST', created_at: new Date() },
      ];

      const result = await service.replicateToS3(entries);
      expect(result.replicatedCount).toBe(2);
    });

    it('should use default bucket when env var is not set', async () => {
      delete process.env.AUDIT_S3_BUCKET;
      const result = await service.replicateToS3([{ id: '1' }]);
      expect(result.bucket).toBe('atlas-audit-worm');
    });

    it('should use custom bucket from env var', async () => {
      process.env.AUDIT_S3_BUCKET = 'my-custom-bucket';
      const result = await service.replicateToS3([{ id: '1' }]);
      expect(result.bucket).toBe('my-custom-bucket');
    });
  });

  describe('scheduleReplication', () => {
    it('should return 0 when no new entries exist', async () => {
      mockPrisma.auditLog.findMany.mockResolvedValue([]);
      const result = await service.scheduleReplication();
      expect(result.replicatedCount).toBe(0);
    });

    it('should replicate new entries since last replication', async () => {
      const entries = [
        { id: '1', event_code: 'LOGIN', created_at: new Date() },
        { id: '2', event_code: 'LOGOUT', created_at: new Date() },
        { id: '3', event_code: 'UPDATE', created_at: new Date() },
      ];
      mockPrisma.auditLog.findMany.mockResolvedValue(entries);

      const result = await service.scheduleReplication();
      expect(result.replicatedCount).toBe(3);
    });
  });

  describe('getReplicationStatus', () => {
    it('should return null lastReplicationAt initially', () => {
      const status = service.getReplicationStatus();
      expect(status.lastReplicationAt).toBeNull();
      expect(status.entryCount).toBe(0);
    });

    it('should update status after replication', async () => {
      await service.replicateToS3([{ id: '1' }, { id: '2' }]);
      const status = service.getReplicationStatus();
      expect(status.lastReplicationAt).toBeInstanceOf(Date);
      expect(status.entryCount).toBe(2);
    });
  });
});
