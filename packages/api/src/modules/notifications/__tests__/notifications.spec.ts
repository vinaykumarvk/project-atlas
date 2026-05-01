import { Test, TestingModule } from '@nestjs/testing';
import { NotificationDispatchService } from '../services/notification-dispatch.service';
import { PendencyReportService, CaseSnapshot } from '../services/pendency-report.service';
import { DigestService } from '../services/digest.service';
import { PrismaService } from '../../../common/prisma';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';
import { NotificationChannel } from '../types';

describe('Notifications Module', () => {
  let dispatchService: NotificationDispatchService;
  let reportService: PendencyReportService;
  let digestService: DigestService;

  beforeEach(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockPrisma = createMockPrismaService() as any;

    // Stateful mock for notification logs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notificationLogs: any[] = [];

    mockPrisma.notificationLog.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => {
      const record = { id: `notif-${notificationLogs.length + 1}`, ...data, created_at: new Date() };
      notificationLogs.push(record);
      return Promise.resolve(record);
    });

    mockPrisma.notificationLog.findMany.mockImplementation(() => {
      return Promise.resolve([...notificationLogs]);
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDispatchService,
        PendencyReportService,
        DigestService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    dispatchService = module.get(NotificationDispatchService);
    reportService = module.get(PendencyReportService);
    digestService = module.get(DigestService);
  });

  describe('Notification Dispatch', () => {
    it('should render template correctly with variables', async () => {
      const result = await dispatchService.send(
        'user-1',
        NotificationChannel.EMAIL,
        'CASE_ASSIGNED',
        {
          case_number: 'ATL-2026-000001',
          fpr_name: 'Amit Sharma',
          priority: 'HIGH',
        },
      );

      expect(result.status).toBe('SENT');
      expect(result.renderedSubject).toBe('Case ATL-2026-000001 assigned to you');
      expect(result.renderedBody).toBe(
        'Dear Amit Sharma, case ATL-2026-000001 has been assigned to you. Priority: HIGH.',
      );
      expect(result.recipientId).toBe('user-1');
      expect(result.channel).toBe(NotificationChannel.EMAIL);
    });

    it('should suppress duplicate notification within dedup window', async () => {
      const variables = {
        case_number: 'ATL-2026-000001',
        fpr_name: 'Amit Sharma',
        priority: 'HIGH',
      };

      const first = await dispatchService.send(
        'user-1',
        NotificationChannel.EMAIL,
        'CASE_ASSIGNED',
        variables,
      );
      const second = await dispatchService.send(
        'user-1',
        NotificationChannel.EMAIL,
        'CASE_ASSIGNED',
        variables,
      );

      expect(first.status).toBe('SENT');
      expect(second.status).toBe('SUPPRESSED');
    });

    it('should allow same notification after dedup window expires', async () => {
      const variables = {
        case_number: 'ATL-2026-000002',
        fpr_name: 'Priya Patel',
        priority: 'MEDIUM',
      };

      const first = await dispatchService.send(
        'user-2',
        NotificationChannel.EMAIL,
        'CASE_ASSIGNED',
        variables,
      );
      expect(first.status).toBe('SENT');

      // Expire the dedup entry
      dispatchService.expireDedupEntry(
        'user-2',
        NotificationChannel.EMAIL,
        'CASE_ASSIGNED',
        variables,
      );

      const second = await dispatchService.send(
        'user-2',
        NotificationChannel.EMAIL,
        'CASE_ASSIGNED',
        variables,
      );
      expect(second.status).toBe('SENT');
    });

    it('should dispatch to multiple channels for escalation (EMAIL + IN_APP)', async () => {
      const variables = {
        case_number: 'ATL-2026-000003',
        breach_hours: '4',
      };

      const emailResult = await dispatchService.send(
        'user-1',
        NotificationChannel.EMAIL,
        'ESCALATION',
        variables,
      );
      const inAppResult = await dispatchService.send(
        'user-1',
        NotificationChannel.IN_APP,
        'ESCALATION',
        variables,
      );

      expect(emailResult.status).toBe('SENT');
      expect(emailResult.channel).toBe(NotificationChannel.EMAIL);
      expect(inAppResult.status).toBe('SENT');
      expect(inAppResult.channel).toBe(NotificationChannel.IN_APP);

      expect(emailResult.renderedSubject).toBe('Escalation: Case ATL-2026-000003');
      expect(inAppResult.renderedSubject).toBe('Escalation: Case ATL-2026-000003');
      expect(emailResult.renderedBody).toContain('breach of 4 hours');
      expect(inAppResult.renderedBody).toContain('breach of 4 hours');

      const log = await dispatchService.getLog();
      expect(log.length).toBe(2);
    });
  });

  describe('Pendency Report', () => {
    it('should generate correct summary structure', async () => {
      const today = new Date();
      today.setHours(10, 0, 0, 0);

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(10, 0, 0, 0);

      const cases: CaseSnapshot[] = [
        {
          id: 'case-1',
          status: 'IN_PROGRESS',
          team: 'TeamA',
          fprId: 'fpr-1',
          fprName: 'Amit Sharma',
          caseType: 'VALUATION_REQUEST',
          createdAt: today,
          isBreached: true,
          tatTargetAt: new Date(today.getTime() - 3600000),
        },
        {
          id: 'case-2',
          status: 'ROUTED',
          team: 'TeamA',
          fprId: 'fpr-2',
          fprName: 'Priya Patel',
          caseType: 'VALUATION_REQUEST',
          createdAt: today,
          isBreached: false,
        },
        {
          id: 'case-3',
          status: 'AWAITING_VENDOR',
          team: 'TeamB',
          fprId: 'fpr-1',
          fprName: 'Amit Sharma',
          caseType: 'LEGAL_OPINION',
          createdAt: yesterday,
          isBreached: true,
        },
        {
          id: 'case-4',
          status: 'CLOSED',
          team: 'TeamA',
          fprId: 'fpr-1',
          fprName: 'Amit Sharma',
          caseType: 'VALUATION_REQUEST',
          createdAt: yesterday,
          resolvedAt: new Date(yesterday.getTime() + 24 * 3600000),
          isBreached: false,
        },
        {
          id: 'case-5',
          status: 'IN_PROGRESS',
          team: 'TeamB',
          fprId: 'fpr-3',
          fprName: 'Suresh Reddy',
          caseType: 'VALUATION_REQUEST',
          createdAt: yesterday,
          isBreached: false,
        },
      ];

      reportService.setCases(cases);
      const report = await reportService.generateDailyReport(today);

      expect(report.generatedAt).toBeInstanceOf(Date);
      expect(report.period).toBeDefined();
      expect(report.period.from).toBeInstanceOf(Date);
      expect(report.period.to).toBeInstanceOf(Date);
      expect(report.summary).toBeDefined();
      expect(report.sections).toBeInstanceOf(Array);
      expect(report.sections.length).toBeGreaterThan(0);

      expect(report.summary.totalOpenCases).toBe(4);
      expect(report.summary.statusBreakdown).toEqual({
        IN_PROGRESS: 2,
        ROUTED: 1,
        AWAITING_VENDOR: 1,
      });
      expect(report.summary.breachedCasesByTeam).toEqual({
        TeamA: 1,
        TeamB: 1,
      });
      expect(report.summary.breachedCasesByFpr).toEqual({
        'Amit Sharma': 2,
      });
      expect(report.summary.averageResolutionTimeHours).toBe(24);
      expect(report.summary.newCasesToday).toBe(2);
      expect(report.summary.newCasesYesterday).toBe(3);

      const sectionTitles = report.sections.map((s) => s.title);
      expect(sectionTitles).toContain('Open Cases by Status');
      expect(sectionTitles).toContain('Breached Cases by Team');
      expect(sectionTitles).toContain('Breached Cases by FPR');
      expect(sectionTitles).toContain('Resolution Metrics');
      expect(sectionTitles).toContain('New Cases Comparison');
    });
  });

  describe('Digest Service', () => {
    it('should batch notifications for same recipient', () => {
      digestService.addToDigest('user-1', {
        templateCode: 'CASE_ASSIGNED',
        variables: { case_number: 'ATL-2026-000001' },
        renderedSubject: 'Case ATL-2026-000001 assigned',
        renderedBody: 'Case assigned to you',
      });

      digestService.addToDigest('user-1', {
        templateCode: 'SLA_BREACH_WARNING',
        variables: { case_number: 'ATL-2026-000002' },
        renderedSubject: 'SLA Warning: ATL-2026-000002',
        renderedBody: 'SLA breach warning',
      });

      const batch = digestService.getDigestBatch('user-1');
      expect(batch).toBeDefined();
      expect(batch!.items.length).toBe(2);
      expect(batch!.items[0].templateCode).toBe('CASE_ASSIGNED');
      expect(batch!.items[1].templateCode).toBe('SLA_BREACH_WARNING');
      expect(batch!.recipientId).toBe('user-1');
    });

    it('should flush digests and send combined notification', async () => {
      digestService.setDigestWindow(0); // immediate flush for testing

      digestService.addToDigest('user-1', {
        templateCode: 'CASE_ASSIGNED',
        variables: { case_number: 'ATL-2026-000001' },
        renderedSubject: 'Case ATL-2026-000001 assigned',
        renderedBody: 'Case assigned to you',
      });

      digestService.addToDigest('user-1', {
        templateCode: 'SLA_BREACH_WARNING',
        variables: { case_number: 'ATL-2026-000002' },
        renderedSubject: 'SLA Warning: ATL-2026-000002',
        renderedBody: 'SLA breach warning',
      });

      digestService.addToDigest('user-2', {
        templateCode: 'ESCALATION',
        variables: { case_number: 'ATL-2026-000003' },
        renderedSubject: 'Escalation: ATL-2026-000003',
        renderedBody: 'Case escalated',
      });

      const flushedCount = await digestService.flushDigests();

      expect(flushedCount).toBe(2); // Two recipients

      // Verify notifications were dispatched
      const log = await dispatchService.getLog();
      expect(log.length).toBe(2);
      expect(log[0].recipientId).toBe('user-1');
      expect(log[1].recipientId).toBe('user-2');
      expect(log[0].templateCode).toBe('DAILY_DIGEST');
      expect(log[1].templateCode).toBe('DAILY_DIGEST');

      // Verify batch was cleared
      expect(digestService.getPendingCount()).toBe(0);
    });
  });
});
