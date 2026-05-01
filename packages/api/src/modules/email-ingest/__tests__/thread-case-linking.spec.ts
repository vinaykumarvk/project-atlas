import { IntakeOrchestratorService } from '../services/intake-orchestrator.service';

describe('IntakeOrchestratorService — Thread Case Linking (FR-004.A3)', () => {
  let service: IntakeOrchestratorService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      emailIngest: { findUnique: jest.fn(), update: jest.fn() },
      case: { findUnique: jest.fn(), update: jest.fn() },
      caseActivityLog: { findFirst: jest.fn(), create: jest.fn() },
    };
    // Construct with mocks for all dependencies
    service = new IntakeOrchestratorService(
      mockPrisma,
      { updateStatus: jest.fn() } as any,
      { classify: jest.fn() } as any,
      { createCase: jest.fn() } as any,
      { emit: jest.fn() } as any,
      { scanForPii: jest.fn().mockReturnValue({ hasPii: false, findings: [] }) } as any,
    );
  });

  it('should find existing case by thread message ID', async () => {
    mockPrisma.caseActivityLog.findFirst.mockResolvedValue({ case_id: 'case-1' });
    mockPrisma.case.findUnique.mockResolvedValue({
      id: 'case-1',
      case_number: 'ATL-2026-000001',
      status: 'ROUTED',
    });

    const result = await service.findCaseByThreadId(['msg-abc@example.com']);
    expect(result).toBeTruthy();
    expect(result!.id).toBe('case-1');
  });

  it('should return null if no matching activity log', async () => {
    mockPrisma.caseActivityLog.findFirst.mockResolvedValue(null);
    const result = await service.findCaseByThreadId(['msg-xyz@example.com']);
    expect(result).toBeNull();
  });

  it('should return null for closed cases', async () => {
    mockPrisma.caseActivityLog.findFirst.mockResolvedValue({ case_id: 'case-2' });
    mockPrisma.case.findUnique.mockResolvedValue({
      id: 'case-2',
      case_number: 'ATL-2026-000002',
      status: 'CLOSED',
    });

    const result = await service.findCaseByThreadId(['msg-closed@example.com']);
    expect(result).toBeNull();
  });

  it('should return null for empty message IDs array', async () => {
    const result = await service.findCaseByThreadId([]);
    expect(result).toBeNull();
  });
});
