import { BadRequestException } from '@nestjs/common';
import { CaseMergeService } from '../services/case-merge.service';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';

describe('CaseMergeService', () => {
  let service: CaseMergeService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = createMockPrismaService();
    service = new CaseMergeService(mockPrisma);
  });

  it('should throw when more than 10 secondary cases are provided', async () => {
    mockPrisma.case.findUnique.mockResolvedValue({
      id: 'primary-1',
      case_number: 'ATL-001',
      status: 'IN_PROGRESS',
    });

    const ids = Array.from({ length: 11 }, (_, i) => `case-${i}`);
    await expect(service.merge('primary-1', ids, 'actor-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should throw when no secondary case IDs are provided', async () => {
    await expect(service.merge('primary-1', [], 'actor-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('should throw when primary case is not found', async () => {
    mockPrisma.case.findUnique.mockResolvedValue(null);

    await expect(
      service.merge('nonexistent', ['case-1'], 'actor-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw when primary case is CLOSED', async () => {
    mockPrisma.case.findUnique.mockResolvedValue({
      id: 'primary-1',
      case_number: 'ATL-001',
      status: 'CLOSED',
    });

    await expect(
      service.merge('primary-1', ['case-2'], 'actor-1'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should merge a secondary case into the primary case', async () => {
    // First call returns primary, second call returns secondary
    mockPrisma.case.findUnique
      .mockResolvedValueOnce({
        id: 'primary-1',
        case_number: 'ATL-001',
        status: 'IN_PROGRESS',
      })
      .mockResolvedValueOnce({
        id: 'secondary-1',
        case_number: 'ATL-002',
        status: 'IN_PROGRESS',
      });

    const result = await service.merge('primary-1', ['secondary-1'], 'actor-1');

    expect(result.merged).toEqual(['secondary-1']);
    expect(result.errors).toEqual([]);
    // Verify $transaction was called (merge logic runs inside transaction)
    expect(mockPrisma.$transaction).toHaveBeenCalled();
  });

  it('should report errors for secondary cases that are CLOSED or not found', async () => {
    mockPrisma.case.findUnique
      .mockResolvedValueOnce({
        id: 'primary-1',
        case_number: 'ATL-001',
        status: 'IN_PROGRESS',
      })
      .mockResolvedValueOnce(null) // case-not-found
      .mockResolvedValueOnce({
        id: 'closed-1',
        case_number: 'ATL-003',
        status: 'CLOSED',
      });

    const result = await service.merge(
      'primary-1',
      ['case-not-found', 'closed-1'],
      'actor-1',
    );

    expect(result.merged).toEqual([]);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].error).toBe('Case not found');
    expect(result.errors[1].error).toContain('CLOSED');
  });
});
