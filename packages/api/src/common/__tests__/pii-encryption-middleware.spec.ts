import { registerPiiEncryptionMiddleware, PII_FIELDS } from '../middleware/pii-encryption.middleware';

describe('PII Encryption Middleware', () => {
  let mockPrisma: any;
  let mockEncryptionService: any;
  let middlewareFn: any;

  beforeEach(() => {
    mockPrisma = {
      $use: jest.fn((fn) => { middlewareFn = fn; }),
    };
    mockEncryptionService = {
      encrypt: jest.fn((val: string) => `ENC:${val}`),
      decrypt: jest.fn((val: string) => val.replace('ENC:', '')),
    };
    registerPiiEncryptionMiddleware(mockPrisma, mockEncryptionService);
  });

  it('should register middleware on prisma', () => {
    expect(mockPrisma.$use).toHaveBeenCalledTimes(1);
    expect(middlewareFn).toBeDefined();
  });

  it('should encrypt PII fields on create', async () => {
    const next = jest.fn().mockResolvedValue({ id: 1 });
    const params = {
      model: 'emailIngest',
      action: 'create',
      args: { data: { from_address: 'test@example.com', sender_name: 'John', subject: 'Hello' } },
    };
    await middlewareFn(params, next);
    expect(params.args.data.from_address).toBe('ENC:test@example.com');
    expect(params.args.data.sender_name).toBe('ENC:John');
    expect(params.args.data.subject).toBe('Hello'); // non-PII unchanged
  });

  it('should decrypt PII fields on findMany', async () => {
    const records = [
      { from_address: 'ENC:test@example.com', sender_name: 'ENC:John' },
      { from_address: 'ENC:jane@example.com', sender_name: 'ENC:Jane' },
    ];
    const next = jest.fn().mockResolvedValue(records);
    const params = { model: 'emailIngest', action: 'findMany', args: {} };
    const result = await middlewareFn(params, next);
    expect(result[0].from_address).toBe('test@example.com');
    expect(result[1].sender_name).toBe('Jane');
  });

  it('should skip models without PII fields', async () => {
    const next = jest.fn().mockResolvedValue({ id: 1, name: 'test' });
    const params = { model: 'AuditLog', action: 'create', args: { data: { name: 'test' } } };
    await middlewareFn(params, next);
    expect(mockEncryptionService.encrypt).not.toHaveBeenCalled();
  });

  it('should not fail when encryption service is null', () => {
    const nullPrisma = { $use: jest.fn() };
    registerPiiEncryptionMiddleware(nullPrisma, null);
    expect(nullPrisma.$use).not.toHaveBeenCalled();
  });
});
