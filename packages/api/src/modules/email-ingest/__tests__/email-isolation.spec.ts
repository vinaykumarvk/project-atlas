import { IntakeOrchestratorService } from '../services/intake-orchestrator.service';

describe('IntakeOrchestratorService — Email Isolation (FR-129.A1)', () => {
  let service: IntakeOrchestratorService;
  let mockPrisma: any;
  let mockEmailIngestService: any;

  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    mockPrisma = {
      emailIngest: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      case: { findUnique: jest.fn() },
      caseActivityLog: { create: jest.fn() },
    };
    mockEmailIngestService = {
      updateStatus: jest.fn(),
    };
    service = new IntakeOrchestratorService(
      mockPrisma,
      mockEmailIngestService as any,
      { classify: jest.fn() } as any,
      { createCase: jest.fn() } as any,
      { emit: jest.fn() } as any,
      { scanForPii: jest.fn().mockReturnValue({ hasPii: false, findings: [] }) } as any,
    );
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should reject emails from non-allowed domains in dev environment', async () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOWED_DEV_DOMAINS = 'test.com,dev.com';
    mockPrisma.emailIngest.findUnique.mockResolvedValue({
      id: 'e1',
      from_address: 'user@external.com',
      subject: 'Test',
      body_text: 'body',
    });

    await expect(service.orchestrate('e1')).rejects.toThrow('email isolation');
    expect(mockEmailIngestService.updateStatus).toHaveBeenCalledWith('e1', 'QUARANTINED');
  });

  it('should allow emails from allowed domains in dev environment', async () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOWED_DEV_DOMAINS = 'test.com';
    mockPrisma.emailIngest.findUnique.mockResolvedValue({
      id: 'e1',
      from_address: 'user@test.com',
      subject: 'Test',
      body_text: 'body',
      thread_context: null,
    });

    // Will proceed past isolation check (may fail at classify step, which is expected)
    try {
      await service.orchestrate('e1');
    } catch (e) {
      // We expect a classification error, not an isolation error
      expect((e as Error).message).not.toContain('email isolation');
    }
  });

  it('should not apply isolation in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.ALLOWED_DEV_DOMAINS = 'test.com';
    mockPrisma.emailIngest.findUnique.mockResolvedValue({
      id: 'e1',
      from_address: 'user@external.com',
      subject: 'Test',
      body_text: 'body',
      thread_context: null,
    });

    try {
      await service.orchestrate('e1');
    } catch (e) {
      expect((e as Error).message).not.toContain('email isolation');
    }
  });

  it('should skip isolation when ALLOWED_DEV_DOMAINS is empty', async () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOWED_DEV_DOMAINS = '';
    mockPrisma.emailIngest.findUnique.mockResolvedValue({
      id: 'e1',
      from_address: 'user@any-domain.com',
      subject: 'Test',
      body_text: 'body',
      thread_context: null,
    });

    try {
      await service.orchestrate('e1');
    } catch (e) {
      expect((e as Error).message).not.toContain('email isolation');
    }
  });
});
