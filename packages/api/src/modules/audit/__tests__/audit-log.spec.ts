import { Test, TestingModule } from '@nestjs/testing';
import { createHash } from 'crypto';
import { AuditLogService } from '../services/audit-log.service';
import { PiiRedactionService } from '../services/pii-redaction.service';
import { PrismaService } from '../../../common/prisma';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

const GENESIS_HASH =
  '0000000000000000000000000000000000000000000000000000000000000000';

function computeExpectedHash(
  prevHash: string,
  eventCode: string,
  actorId: string,
  resourceType: string,
  resourceId: string,
  action: string,
  timestamp: string,
): string {
  const input = [
    prevHash,
    eventCode,
    actorId,
    resourceType,
    resourceId,
    action,
    timestamp,
  ].join('|');
  return createHash('sha256').update(input).digest('hex');
}

// ---------------------------------------------------------------
// AuditLogService Tests
// ---------------------------------------------------------------

describe('AuditLogService', () => {
  let service: AuditLogService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let auditStore: any[];

  beforeEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockPrisma = createMockPrismaService() as any;

    // Stateful mock for auditLog — critical for hash chain verification
    auditStore = [];

    mockPrisma.auditLog.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      auditStore.push({ ...data });
      return Promise.resolve({ ...data });
    });

    mockPrisma.auditLog.findFirst.mockImplementation(({ orderBy }: { orderBy?: Record<string, string> } = {}) => {
      if (auditStore.length === 0) return Promise.resolve(null);
      if (orderBy?.created_at === 'desc') {
        // Return the last inserted entry (most recent by insertion order)
        return Promise.resolve(auditStore[auditStore.length - 1]);
      }
      return Promise.resolve(auditStore[auditStore.length - 1]);
    });

    mockPrisma.auditLog.findMany.mockImplementation(({ orderBy, where, skip, take }: { orderBy?: Record<string, string>; where?: Record<string, unknown>; skip?: number; take?: number } = {}) => {
      let results = [...auditStore];
      if (where) {
        if (where.event_code) results = results.filter((e) => e.event_code === where.event_code);
        if (where.actor_id) results = results.filter((e) => e.actor_id === where.actor_id);
      }
      if (orderBy?.created_at === 'asc') {
        results.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      }
      if (skip !== undefined) results = results.slice(skip);
      if (take !== undefined) results = results.slice(0, take);
      return Promise.resolve(results);
    });

    mockPrisma.auditLog.count.mockImplementation(({ where }: { where?: Record<string, unknown> } = {}) => {
      let results = [...auditStore];
      if (where) {
        if (where.event_code) results = results.filter((e) => e.event_code === where.event_code);
        if (where.actor_id) results = results.filter((e) => e.actor_id === where.actor_id);
      }
      return Promise.resolve(results.length);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(AuditLogService);
  });

  describe('emit', () => {
    it('should create an entry with a correct hash', async () => {
      const entry = await service.emit({
        event_code: 'LOGIN_SUCCESS',
        actor_id: 'user-001',
        actor_type: 'USER',
        resource_type: 'Session',
        resource_id: 'session-001',
        action: 'CREATE',
      });

      expect(entry.id).toBeDefined();
      expect(entry.event_code).toBe('LOGIN_SUCCESS');
      expect(entry.actor_id).toBe('user-001');
      expect(entry.action).toBe('CREATE');
      expect(entry.row_hash).toHaveLength(64);

      const expectedHash = computeExpectedHash(
        GENESIS_HASH,
        'LOGIN_SUCCESS',
        'user-001',
        'Session',
        'session-001',
        'CREATE',
        entry.created_at.toISOString(),
      );
      expect(entry.row_hash).toBe(expectedHash);

      expect(entry.prev_hash).toBeNull();
    });

    it('should link entries correctly in the hash chain', async () => {
      const entry1 = await service.emit({
        event_code: 'CASE_CREATED',
        actor_id: 'user-001',
        action: 'CREATE',
        resource_type: 'Case',
        resource_id: 'case-001',
      });

      const entry2 = await service.emit({
        event_code: 'CASE_UPDATED',
        actor_id: 'user-002',
        action: 'UPDATE',
        resource_type: 'Case',
        resource_id: 'case-001',
      });

      expect(entry2.prev_hash).toBe(entry1.row_hash);

      const expectedHash = computeExpectedHash(
        entry1.row_hash,
        'CASE_UPDATED',
        'user-002',
        'Case',
        'case-001',
        'UPDATE',
        entry2.created_at.toISOString(),
      );
      expect(entry2.row_hash).toBe(expectedHash);
    });

    it('should set prev_hash to null for the first entry', async () => {
      const entry = await service.emit({
        event_code: 'SYSTEM_START',
        action: 'CREATE',
      });

      expect(entry.prev_hash).toBeNull();
    });
  });

  describe('getLastHash', () => {
    it('should return genesis hash when store is empty', async () => {
      expect(await service.getLastHash()).toBe(GENESIS_HASH);
    });

    it('should return the last entry row_hash after emit', async () => {
      const entry = await service.emit({
        event_code: 'TEST',
        action: 'CREATE',
      });

      expect(await service.getLastHash()).toBe(entry.row_hash);
    });
  });

  describe('verifyChain', () => {
    it('should return valid for an empty chain', async () => {
      const result = await service.verifyChain();
      expect(result.valid).toBe(true);
    });

    it('should return valid for a correctly formed chain', async () => {
      await service.emit({
        event_code: 'EVENT_1',
        actor_id: 'user-001',
        action: 'CREATE',
        resource_type: 'Case',
        resource_id: 'case-001',
      });
      await service.emit({
        event_code: 'EVENT_2',
        actor_id: 'user-002',
        action: 'UPDATE',
        resource_type: 'Case',
        resource_id: 'case-001',
      });
      await service.emit({
        event_code: 'EVENT_3',
        actor_id: 'user-001',
        action: 'DELETE',
        resource_type: 'Case',
        resource_id: 'case-002',
      });

      const result = await service.verifyChain();
      expect(result.valid).toBe(true);
      expect(result.broken_at).toBeUndefined();
    });

    it('should detect tampering when a middle entry is modified', async () => {
      await service.emit({
        event_code: 'EVENT_1',
        actor_id: 'user-001',
        action: 'CREATE',
        resource_type: 'Case',
        resource_id: 'case-001',
      });

      const entry2 = await service.emit({
        event_code: 'EVENT_2',
        actor_id: 'user-002',
        action: 'UPDATE',
        resource_type: 'Case',
        resource_id: 'case-001',
      });

      await service.emit({
        event_code: 'EVENT_3',
        actor_id: 'user-001',
        action: 'DELETE',
        resource_type: 'Case',
        resource_id: 'case-002',
      });

      // Tamper with the middle entry via the mock store (simulating DB tampering)
      const middleEntry = auditStore.find(
        (e: { id: string }) => e.id === entry2.id,
      );
      middleEntry.action = 'TAMPERED';

      const result = await service.verifyChain();
      expect(result.valid).toBe(false);
      expect(result.broken_at).toBe(entry2.id);
    });

    it('should detect broken prev_hash linkage', async () => {
      await service.emit({
        event_code: 'EVENT_1',
        actor_id: 'user-001',
        action: 'CREATE',
      });

      await service.emit({
        event_code: 'EVENT_2',
        actor_id: 'user-002',
        action: 'UPDATE',
      });

      const entry3 = await service.emit({
        event_code: 'EVENT_3',
        actor_id: 'user-001',
        action: 'DELETE',
      });

      // Tamper with the prev_hash of the third entry
      const thirdEntry = auditStore.find(
        (e: { id: string }) => e.id === entry3.id,
      );
      thirdEntry.prev_hash = 'deadbeef'.repeat(8);

      const result = await service.verifyChain();
      expect(result.valid).toBe(false);
      expect(result.broken_at).toBe(entry3.id);
    });
  });

  describe('query', () => {
    it('should paginate results', async () => {
      for (let i = 0; i < 5; i++) {
        await service.emit({
          event_code: `EVENT_${i}`,
          actor_id: 'user-001',
          action: 'CREATE',
        });
      }

      const result = await service.query({ page: 1, limit: 2 });
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(5);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(2);
    });

    it('should filter by event_code', async () => {
      await service.emit({ event_code: 'LOGIN', action: 'CREATE' });
      await service.emit({ event_code: 'LOGOUT', action: 'CREATE' });
      await service.emit({ event_code: 'LOGIN', action: 'CREATE' });

      const result = await service.query({ event_code: 'LOGIN' });
      expect(result.data).toHaveLength(2);
    });

    it('should filter by actor_id', async () => {
      await service.emit({
        event_code: 'TEST',
        actor_id: 'user-001',
        action: 'CREATE',
      });
      await service.emit({
        event_code: 'TEST',
        actor_id: 'user-002',
        action: 'CREATE',
      });

      const result = await service.query({ actor_id: 'user-001' });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].actor_id).toBe('user-001');
    });
  });
});

// ---------------------------------------------------------------
// PiiRedactionService Tests
// ---------------------------------------------------------------

describe('PiiRedactionService', () => {
  let service: PiiRedactionService;

  beforeEach(() => {
    service = new PiiRedactionService();
  });

  describe('redact', () => {
    it('should redact email addresses', () => {
      const data = { message: 'Contact john.doe@example.com for details' };
      const redacted = service.redact(data);

      expect(redacted.message).not.toContain('john.doe@example.com');
      expect(redacted.message).toContain('[REDACTED:email:');
    });

    it('should redact Indian mobile phone numbers', () => {
      const data = { phone: 'Call me at +91 9876543210' };
      const redacted = service.redact(data);

      expect(redacted.phone).not.toContain('9876543210');
      expect(redacted.phone).toContain('[REDACTED:phone_in:');
    });

    it('should redact PAN card numbers', () => {
      const data = { document: 'PAN: ABCDE1234F' };
      const redacted = service.redact(data);

      expect(redacted.document).not.toContain('ABCDE1234F');
      expect(redacted.document).toContain('[REDACTED:pan:');
    });

    it('should redact Aadhaar-like patterns', () => {
      const data = { id: 'Aadhaar: 1234 5678 9012' };
      const redacted = service.redact(data);

      expect(redacted.id).not.toContain('1234 5678 9012');
      expect(redacted.id).toContain('[REDACTED:aadhaar:');
    });

    it('should not mutate the original object', () => {
      const original = { email: 'test@example.com', nested: { phone: '+919876543210' } };
      const originalCopy = JSON.parse(JSON.stringify(original));
      service.redact(original);

      expect(original).toEqual(originalCopy);
    });

    it('should handle nested objects and arrays', () => {
      const data = {
        contacts: [
          { email: 'a@b.com' },
          { email: 'c@d.com' },
        ],
        meta: {
          pan: 'ABCDE1234F',
        },
      };

      const redacted = service.redact(data);

      expect(redacted.contacts[0].email).toContain('[REDACTED:email:');
      expect(redacted.contacts[1].email).toContain('[REDACTED:email:');
      expect(redacted.meta.pan).toContain('[REDACTED:pan:');
    });
  });

  describe('hashPii', () => {
    it('should produce deterministic output (same input -> same hash)', () => {
      const hash1 = service.hashPii('test@example.com');
      const hash2 = service.hashPii('test@example.com');

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = service.hashPii('test@example.com');
      const hash2 = service.hashPii('other@example.com');

      expect(hash1).not.toBe(hash2);
    });

    it('should be deterministic for redaction (same email always redacts the same way)', () => {
      const data1 = { email: 'john@example.com' };
      const data2 = { email: 'john@example.com' };

      const redacted1 = service.redact(data1);
      const redacted2 = service.redact(data2);

      expect(redacted1.email).toBe(redacted2.email);
    });
  });
});
