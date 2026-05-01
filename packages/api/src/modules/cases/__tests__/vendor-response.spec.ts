import { VendorResponseService } from '../services/vendor-response.service';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';

describe('VendorResponseService (FR-082.A1-A3)', () => {
  let service: VendorResponseService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = createMockPrismaService();
    service = new VendorResponseService(mockPrisma);
  });

  it('should return a submissionId, receivedAt, and fileCount', async () => {
    const result = await service.processResponse(
      'vendor-1',
      'case-1',
      [{ filename: 'report.pdf', mimeType: 'application/pdf' }],
      { summary: 'Valuation complete' },
    );

    expect(result.submissionId).toBeDefined();
    expect(result.receivedAt).toBeInstanceOf(Date);
    expect(result.fileCount).toBe(1);
  });

  it('should create a caseActivityLog entry', async () => {
    await service.processResponse(
      'vendor-1',
      'case-1',
      [{ filename: 'report.pdf', mimeType: 'application/pdf' }],
      { summary: 'Done', remarks: 'No issues' },
    );

    expect(mockPrisma.caseActivityLog.create).toHaveBeenCalledTimes(1);
    const createCall = mockPrisma.caseActivityLog.create.mock.calls[0][0];
    expect(createCall.data.action_code).toBe('VENDOR_RESPONSE_RECEIVED');
    expect(createCall.data.actor_type).toBe('VENDOR');
    expect(createCall.data.actor_id).toBe('vendor-1');
    expect(createCall.data.case_id).toBe('case-1');
  });

  it('should include file metadata in the activity log payload', async () => {
    const files = [
      { filename: 'photo.jpg', mimeType: 'image/jpeg' },
      { filename: 'doc.pdf', mimeType: 'application/pdf' },
    ];

    await service.processResponse('vendor-2', 'case-2', files, {
      summary: 'Site visit complete',
    });

    const payload = mockPrisma.caseActivityLog.create.mock.calls[0][0].data.payload_json;
    expect(payload.fileCount).toBe(2);
    expect(payload.files).toHaveLength(2);
    expect(payload.files[0].filename).toBe('photo.jpg');
  });

  it('should handle empty files array', async () => {
    const result = await service.processResponse(
      'vendor-3',
      'case-3',
      [],
      { summary: 'Verbal confirmation only' },
    );

    expect(result.fileCount).toBe(0);
    expect(mockPrisma.caseActivityLog.create).toHaveBeenCalledTimes(1);
  });

  it('should set remarks to null when not provided', async () => {
    await service.processResponse(
      'vendor-4',
      'case-4',
      [{ filename: 'file.pdf', mimeType: 'application/pdf' }],
      { summary: 'Complete' },
    );

    const payload = mockPrisma.caseActivityLog.create.mock.calls[0][0].data.payload_json;
    expect(payload.remarks).toBeNull();
  });

  it('should include remarks when provided', async () => {
    await service.processResponse(
      'vendor-5',
      'case-5',
      [{ filename: 'file.pdf', mimeType: 'application/pdf' }],
      { summary: 'Done', remarks: 'Property in good condition' },
    );

    const payload = mockPrisma.caseActivityLog.create.mock.calls[0][0].data.payload_json;
    expect(payload.remarks).toBe('Property in good condition');
  });

  it('should generate a unique submissionId for each call', async () => {
    const result1 = await service.processResponse(
      'vendor-1',
      'case-1',
      [],
      { summary: 'First' },
    );
    const result2 = await service.processResponse(
      'vendor-1',
      'case-1',
      [],
      { summary: 'Second' },
    );

    expect(result1.submissionId).not.toBe(result2.submissionId);
  });

  it('should include receivedAt ISO string in payload', async () => {
    await service.processResponse(
      'vendor-6',
      'case-6',
      [],
      { summary: 'Test' },
    );

    const payload = mockPrisma.caseActivityLog.create.mock.calls[0][0].data.payload_json;
    expect(payload.receivedAt).toBeDefined();
    // Should be a valid ISO date string
    expect(new Date(payload.receivedAt).toISOString()).toBe(payload.receivedAt);
  });
});
