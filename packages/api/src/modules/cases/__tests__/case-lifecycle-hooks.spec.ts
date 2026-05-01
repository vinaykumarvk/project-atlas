import { CaseLifecycleHooksService } from '../services/case-lifecycle-hooks.service';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';

describe('CaseLifecycleHooksService', () => {
  let service: CaseLifecycleHooksService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = createMockPrismaService();
    service = new CaseLifecycleHooksService(mockPrisma);
  });

  it('should push case status to LMS when status changes to RESOLVED with a loan account', async () => {
    const caseRecord = {
      id: 'case-1',
      case_number: 'ATL-2026-000001',
      loan_account_no: 'LOAN-12345',
      status: 'IN_PROGRESS',
    };

    await service.onStatusChange(caseRecord, 'RESOLVED');

    expect(mockPrisma.caseActivityLog.create).toHaveBeenCalledWith({
      data: {
        case_id: 'case-1',
        action_code: 'LMS_STATUS_PUSH',
        actor_type: 'SYSTEM',
        payload_json: expect.objectContaining({
          loanAccountNo: 'LOAN-12345',
          status: 'RESOLVED',
        }),
      },
    });
  });

  it('should push case status to LMS when status changes to CLOSED with a loan account', async () => {
    const caseRecord = {
      id: 'case-2',
      case_number: 'ATL-2026-000002',
      loan_account_no: 'LOAN-67890',
      status: 'RESOLVED',
    };

    await service.onStatusChange(caseRecord, 'CLOSED');

    expect(mockPrisma.caseActivityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        case_id: 'case-2',
        action_code: 'LMS_STATUS_PUSH',
      }),
    });
  });

  it('should NOT push to LMS when status changes to IN_PROGRESS', async () => {
    const caseRecord = {
      id: 'case-3',
      case_number: 'ATL-2026-000003',
      loan_account_no: 'LOAN-11111',
      status: 'NEW',
    };

    await service.onStatusChange(caseRecord, 'IN_PROGRESS');

    expect(mockPrisma.caseActivityLog.create).not.toHaveBeenCalled();
  });

  it('should NOT push to LMS when there is no loan account number', async () => {
    const caseRecord = {
      id: 'case-4',
      case_number: 'ATL-2026-000004',
      loan_account_no: null,
      status: 'IN_PROGRESS',
    };

    await service.onStatusChange(caseRecord, 'RESOLVED');

    expect(mockPrisma.caseActivityLog.create).not.toHaveBeenCalled();
  });

  it('should include pushed timestamp in the activity log payload', async () => {
    const caseRecord = {
      id: 'case-5',
      case_number: 'ATL-2026-000005',
      loan_account_no: 'LOAN-99999',
    };

    await service.onStatusChange(caseRecord, 'CLOSED');

    const createCall = mockPrisma.caseActivityLog.create.mock.calls[0][0];
    expect(createCall.data.payload_json.pushedAt).toBeDefined();
    // Verify it is a valid ISO date string
    expect(new Date(createCall.data.payload_json.pushedAt).toISOString()).toBe(
      createCall.data.payload_json.pushedAt,
    );
  });
});
