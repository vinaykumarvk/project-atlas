import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataRegionGuard } from '../guards/data-region.guard';
import { createMockPrismaService } from '../prisma/prisma.service.mock';

function createMockContext(
  headers: Record<string, string> = {},
  user: Record<string, unknown> = {},
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers,
        user,
        url: '/test',
        method: 'GET',
        ip: '127.0.0.1',
      }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('DataRegionGuard — India-only production enforcement (FR-121.A1)', () => {
  let guard: DataRegionGuard;
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as Reflector;
    const mockPrisma = createMockPrismaService();
    guard = new DataRegionGuard(reflector, mockPrisma as any);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should block requests in production when DATA_REGION is not ap-south-1', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DATA_REGION = 'us-east-1';

    const ctx = createMockContext();
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('should allow requests in production when DATA_REGION is ap-south-1', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DATA_REGION = 'ap-south-1';

    const ctx = createMockContext();
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });

  it('should allow requests in non-production even with non-India region', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DATA_REGION = 'us-east-1';

    const ctx = createMockContext();
    const result = await guard.canActivate(ctx);
    expect(result).toBe(true);
  });
});
