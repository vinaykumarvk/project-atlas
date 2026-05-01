import { IntakeOrchestratorService } from '../services/intake-orchestrator.service';

describe('IntakeOrchestratorService — OOO Detection (FR-003.A2)', () => {
  let service: IntakeOrchestratorService;

  beforeEach(() => {
    service = new IntakeOrchestratorService(
      {} as any, {} as any, {} as any, {} as any, {} as any, { scanForPii: jest.fn().mockReturnValue({ hasPii: false, findings: [] }) } as any,
    );
  });

  it('should detect "out of office" reply', () => {
    expect(service.detectOooReply('I am currently out of office and will return on Monday.')).toBe(true);
  });

  it('should detect "auto-reply" messages', () => {
    expect(service.detectOooReply('This is an auto-reply message.')).toBe(true);
  });

  it('should detect "on leave" messages', () => {
    expect(service.detectOooReply('I am on annual leave until 15th May.')).toBe(true);
  });

  it('should not flag normal business emails as OOO', () => {
    expect(service.detectOooReply('Please find attached the valuation report for the property at 123 Main Street.')).toBe(false);
  });
});
