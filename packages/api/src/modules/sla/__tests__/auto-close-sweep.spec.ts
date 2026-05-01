import { AutoCloseSweepProcessor } from '../processors/auto-close-sweep.processor';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';

describe('AutoCloseSweepProcessor', () => {
  let processor: AutoCloseSweepProcessor;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = createMockPrismaService();
    processor = new AutoCloseSweepProcessor(mockPrisma);
  });

  it('should close RESOLVED cases older than 30 days', async () => {
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 31);

    mockPrisma.case.findMany.mockResolvedValue([
      { id: 'case-1', case_number: 'ATL-001' },
      { id: 'case-2', case_number: 'ATL-002' },
    ]);

    const result = await processor.process();

    expect(result.closedCount).toBe(2);
    expect(mockPrisma.case.findMany).toHaveBeenCalledWith({
      where: {
        status: 'RESOLVED',
        updated_at: { lt: expect.any(Date) },
      },
      select: { id: true, case_number: true },
    });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
  });

  it('should return closedCount of 0 when no RESOLVED cases match', async () => {
    mockPrisma.case.findMany.mockResolvedValue([]);

    const result = await processor.process();

    expect(result.closedCount).toBe(0);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('should continue processing remaining cases if one fails', async () => {
    mockPrisma.case.findMany.mockResolvedValue([
      { id: 'case-1', case_number: 'ATL-001' },
      { id: 'case-2', case_number: 'ATL-002' },
      { id: 'case-3', case_number: 'ATL-003' },
    ]);

    // Make the second transaction fail
    let callCount = 0;
    mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => {
      callCount++;
      if (callCount === 2) {
        throw new Error('DB error');
      }
      if (typeof fn === 'function') {
        return fn(mockPrisma);
      }
      return Promise.resolve();
    });

    const result = await processor.process();

    // 2 succeeded, 1 failed
    expect(result.closedCount).toBe(2);
  });

  it('should use a 30-day cutoff date', async () => {
    mockPrisma.case.findMany.mockResolvedValue([]);

    await processor.process();

    const callArgs = mockPrisma.case.findMany.mock.calls[0][0];
    const cutoffDate = callArgs.where.updated_at.lt as Date;
    const now = new Date();
    const daysDiff = Math.round(
      (now.getTime() - cutoffDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    expect(daysDiff).toBe(30);
  });

  it('should query only RESOLVED cases', async () => {
    mockPrisma.case.findMany.mockResolvedValue([]);

    await processor.process();

    expect(mockPrisma.case.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'RESOLVED' }),
      }),
    );
  });
});
