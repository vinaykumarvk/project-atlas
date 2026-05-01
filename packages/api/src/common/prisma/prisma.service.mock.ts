import { PrismaService } from './prisma.service';

const modelNames = [
  'user',
  'role',
  'userRole',
  'emailIngest',
  'case',
  'caseLink',
  'caseAttachment',
  'caseActivityLog',
  'propertyLocationMaster',
  'caseTypeMaster',
  'fprMaster',
  'vendorMaster',
  'tatMaster',
  'escalationHierarchyMaster',
  'holidayCalendarMaster',
  'businessHoursMaster',
  'notificationTemplate',
  'notificationLog',
  'aiClassificationResult',
  'suggestedReplyDraft',
  'pendencyReportSchedule',
  'auditLog',
  'consentLedger',
  'masterChangeLog',
  'dsrRequest',
] as const;

type MockDelegate = {
  findMany: jest.Mock;
  findFirst: jest.Mock;
  findUnique: jest.Mock;
  create: jest.Mock;
  createMany: jest.Mock;
  update: jest.Mock;
  updateMany: jest.Mock;
  upsert: jest.Mock;
  delete: jest.Mock;
  deleteMany: jest.Mock;
  count: jest.Mock;
  aggregate: jest.Mock;
};

function buildMockDelegate(): MockDelegate {
  return {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'mock-id', ...data })),
    createMany: jest.fn().mockResolvedValue({ count: 0 }),
    update: jest.fn().mockImplementation(({ data }) => Promise.resolve(data)),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve(create)),
    delete: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue({}),
  };
}

/**
 * Creates a fully-mocked PrismaService for unit tests.
 *
 * Usage:
 *   const prisma = createMockPrismaService();
 *   prisma.user.findUnique.mockResolvedValue({ id: '1', ... });
 */
export function createMockPrismaService(): PrismaService & Record<string, MockDelegate> {
  const mock: Record<string, unknown> = {
    $connect: jest.fn(),
    $disconnect: jest.fn(),
    $transaction: jest.fn().mockImplementation((fn: (tx: unknown) => unknown) => {
      // When called with a function, execute it passing the mock itself as the tx
      if (typeof fn === 'function') {
        return fn(mock);
      }
      // When called with an array of promises, resolve them all
      return Promise.all(fn);
    }),
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(0),
  };

  for (const name of modelNames) {
    mock[name] = buildMockDelegate();
  }

  return mock as unknown as PrismaService & Record<string, MockDelegate>;
}
