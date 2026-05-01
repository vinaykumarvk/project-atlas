import { QuarantinePurgeService } from '../services/quarantine-purge.service';

describe('QuarantinePurgeService', () => {
  let service: QuarantinePurgeService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      emailIngest: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new QuarantinePurgeService(mockPrisma);
  });

  it('should purge quarantined emails older than 90 days', async () => {
    mockPrisma.emailIngest.findMany.mockResolvedValue([
      { id: 'e1', legal_hold: false, message_id: 'msg-1' },
      { id: 'e2', legal_hold: false, message_id: 'msg-2' },
    ]);
    mockPrisma.emailIngest.update.mockResolvedValue({});

    const result = await service.schedulePurge();
    expect(result.purgedCount).toBe(2);
    expect(result.skippedLegalHold).toBe(0);
    expect(mockPrisma.emailIngest.update).toHaveBeenCalledTimes(2);
  });

  it('should skip emails under legal hold', async () => {
    mockPrisma.emailIngest.findMany.mockResolvedValue([
      { id: 'e1', legal_hold: true, message_id: 'msg-1' },
      { id: 'e2', legal_hold: false, message_id: 'msg-2' },
    ]);
    mockPrisma.emailIngest.update.mockResolvedValue({});

    const result = await service.schedulePurge();
    expect(result.purgedCount).toBe(1);
    expect(result.skippedLegalHold).toBe(1);
  });

  it('should return true for legal hold check when flag is set', () => {
    expect(service.isUnderLegalHold({ legal_hold: true })).toBe(true);
  });

  it('should return false for legal hold check when flag is not set', () => {
    expect(service.isUnderLegalHold({ legal_hold: false })).toBe(false);
    expect(service.isUnderLegalHold({ legal_hold: null })).toBe(false);
    expect(service.isUnderLegalHold({})).toBe(false);
  });

  it('should soft-delete email on purge', async () => {
    mockPrisma.emailIngest.update.mockResolvedValue({});
    await service.purge('e1');
    expect(mockPrisma.emailIngest.update).toHaveBeenCalledWith({
      where: { id: 'e1' },
      data: expect.objectContaining({
        ingest_status: 'PURGED',
        body_text: null,
        body_html: null,
      }),
    });
  });

  it('should handle empty quarantine list', async () => {
    mockPrisma.emailIngest.findMany.mockResolvedValue([]);
    const result = await service.schedulePurge();
    expect(result.purgedCount).toBe(0);
    expect(result.skippedLegalHold).toBe(0);
  });
});
