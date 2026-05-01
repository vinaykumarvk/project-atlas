import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { PendencyReportService, CaseSnapshot } from '../services/pendency-report.service';
import { NotificationDispatchService } from '../services/notification-dispatch.service';
import { PendencyReportProcessor } from '../processors/pendency-report.processor';
import { PrismaService } from '../../../common/prisma';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';
import { NotificationChannel, BrdReportSection } from '../types';

describe('Phase 3 — FR-070: Pendency Report Round 2', () => {
  let reportService: PendencyReportService;
  let dispatchService: NotificationDispatchService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockPrisma: any;

  const now = new Date('2026-04-29T10:00:00.000Z');
  const yesterday = new Date('2026-04-28T10:00:00.000Z');

  function buildTestCases(): CaseSnapshot[] {
    return [
      // Overdue: tatTargetAt in the past
      {
        id: 'case-overdue-1',
        caseNumber: 'ATL-2026-000001',
        status: 'IN_PROGRESS',
        team: 'TeamA',
        region: 'NORTH',
        fprId: 'fpr-1',
        fprName: 'Amit Sharma',
        caseType: 'VALUATION_REQUEST',
        createdAt: new Date('2026-04-27T08:00:00.000Z'),
        tatTargetAt: new Date('2026-04-28T08:00:00.000Z'), // 26h ago
        isBreached: true,
      },
      // Overdue: even older
      {
        id: 'case-overdue-2',
        caseNumber: 'ATL-2026-000002',
        status: 'ROUTED',
        team: 'TeamB',
        region: 'SOUTH',
        fprId: 'fpr-2',
        fprName: 'Priya Patel',
        caseType: 'LEGAL_OPINION',
        createdAt: new Date('2026-04-26T08:00:00.000Z'),
        tatTargetAt: new Date('2026-04-27T08:00:00.000Z'), // 50h ago
        isBreached: true,
      },
      // Due Today: tatTargetAt is today
      {
        id: 'case-due-today',
        caseNumber: 'ATL-2026-000003',
        status: 'IN_PROGRESS',
        team: 'TeamA',
        region: 'NORTH',
        fprId: 'fpr-1',
        fprName: 'Amit Sharma',
        caseType: 'VALUATION_REQUEST',
        createdAt: new Date('2026-04-28T06:00:00.000Z'),
        tatTargetAt: new Date('2026-04-29T18:00:00.000Z'),
        isBreached: false,
      },
      // New Since Last Report: created today
      {
        id: 'case-new-1',
        caseNumber: 'ATL-2026-000004',
        status: 'NEW',
        team: 'TeamA',
        region: 'NORTH',
        fprId: 'fpr-3',
        fprName: 'Suresh Reddy',
        caseType: 'VALUATION_REQUEST',
        createdAt: new Date('2026-04-29T08:00:00.000Z'),
        tatTargetAt: new Date('2026-04-30T18:00:00.000Z'),
        isBreached: false,
      },
      // Approaching Deadline: tatTargetAt within next 24h but not yet overdue
      {
        id: 'case-approaching',
        caseNumber: 'ATL-2026-000005',
        status: 'AWAITING_VENDOR',
        team: 'TeamB',
        region: 'SOUTH',
        fprId: 'fpr-2',
        fprName: 'Priya Patel',
        caseType: 'LEGAL_OPINION',
        createdAt: new Date('2026-04-28T06:00:00.000Z'),
        tatTargetAt: new Date('2026-04-29T20:00:00.000Z'), // 10h from now
        isBreached: false,
      },
      // Closed case (should be excluded from BRD sections)
      {
        id: 'case-closed',
        caseNumber: 'ATL-2026-000006',
        status: 'CLOSED',
        team: 'TeamA',
        region: 'NORTH',
        fprId: 'fpr-1',
        fprName: 'Amit Sharma',
        caseType: 'VALUATION_REQUEST',
        createdAt: new Date('2026-04-25T08:00:00.000Z'),
        resolvedAt: new Date('2026-04-27T08:00:00.000Z'),
        tatTargetAt: new Date('2026-04-28T08:00:00.000Z'),
        isBreached: false,
      },
    ];
  }

  beforeEach(async () => {
    mockPrisma = createMockPrismaService();

    mockPrisma.notificationLog.create.mockResolvedValue({
      id: 'mock-id',
      created_at: new Date(),
    });

    mockPrisma.pendencyReportSchedule.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ id: 'sched-1', ...data }),
    );

    mockPrisma.pendencyReportSchedule.findMany.mockResolvedValue([]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PendencyReportService,
        NotificationDispatchService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    reportService = module.get(PendencyReportService);
    dispatchService = module.get(NotificationDispatchService);
  });

  describe('FR-070 A2: BRD-compliant 4-section report', () => {
    it('should produce exactly 4 sections with correct titles', async () => {
      reportService.setCases(buildTestCases());
      const report = await reportService.generateBrdReport(now);

      expect(report.sections).toHaveLength(4);
      expect(report.sections[0].title).toBe('Overdue');
      expect(report.sections[1].title).toBe('Due Today');
      expect(report.sections[2].title).toBe('New Since Last Report');
      expect(report.sections[3].title).toBe('Approaching Deadline (next 24h)');
    });

    it('should sort Overdue cases oldest first', async () => {
      reportService.setCases(buildTestCases());
      const report = await reportService.generateBrdReport(now);

      const overdue = report.sections[0];
      expect(overdue.cases.length).toBe(2);
      // case-overdue-2 has an older tatTargetAt than case-overdue-1
      expect(overdue.cases[0].caseNumber).toBe('ATL-2026-000002');
      expect(overdue.cases[1].caseNumber).toBe('ATL-2026-000001');
    });

    it('should include cases due today in Due Today section', async () => {
      reportService.setCases(buildTestCases());
      const report = await reportService.generateBrdReport(now);

      const dueToday = report.sections[1];
      expect(dueToday.cases.length).toBeGreaterThanOrEqual(1);
      const dueIds = dueToday.cases.map((c) => c.caseId);
      expect(dueIds).toContain('case-due-today');
    });

    it('should include new cases in New Since Last Report section', async () => {
      reportService.setCases(buildTestCases());
      const report = await reportService.generateBrdReport(now);

      const newCases = report.sections[2];
      expect(newCases.cases.length).toBeGreaterThanOrEqual(1);
      const newIds = newCases.cases.map((c) => c.caseId);
      expect(newIds).toContain('case-new-1');
    });

    it('should include approaching deadline cases', async () => {
      reportService.setCases(buildTestCases());
      const report = await reportService.generateBrdReport(now);

      const approaching = report.sections[3];
      const approachIds = approaching.cases.map((c) => c.caseId);
      expect(approachIds).toContain('case-approaching');
    });

    it('should exclude closed cases from all BRD sections', async () => {
      reportService.setCases(buildTestCases());
      const report = await reportService.generateBrdReport(now);

      const allCaseIds = report.sections.flatMap((s) => s.cases.map((c) => c.caseId));
      expect(allCaseIds).not.toContain('case-closed');
    });

    it('should compute hoursOverdue for overdue cases', async () => {
      reportService.setCases(buildTestCases());
      const report = await reportService.generateBrdReport(now);

      const overdue = report.sections[0];
      for (const c of overdue.cases) {
        expect(c.hoursOverdue).toBeDefined();
        expect(c.hoursOverdue).toBeGreaterThan(0);
      }
    });

    it('should compute hoursRemaining for approaching deadline cases', async () => {
      reportService.setCases(buildTestCases());
      const report = await reportService.generateBrdReport(now);

      const approaching = report.sections[3];
      for (const c of approaching.cases) {
        expect(c.hoursRemaining).toBeDefined();
        expect(c.hoursRemaining).toBeGreaterThan(0);
      }
    });

    it('should populate summary counts', async () => {
      reportService.setCases(buildTestCases());
      const report = await reportService.generateBrdReport(now);

      expect(report.summary.totalOverdue).toBe(2);
      expect(report.summary.totalDueToday).toBeGreaterThanOrEqual(1);
      expect(report.summary.totalNewSinceLastReport).toBeGreaterThanOrEqual(1);
      expect(report.summary.totalApproachingDeadline).toBeGreaterThanOrEqual(1);
    });

    it('should use lastReportAt for New Since Last Report when set', async () => {
      reportService.setCases(buildTestCases());
      // Set last report to a time before any new cases
      reportService.setLastReportAt(new Date('2026-04-29T09:00:00.000Z'));

      const report = await reportService.generateBrdReport(now);
      const newCases = report.sections[2];

      // Only cases created after 09:00 should appear
      // case-new-1 was created at 08:00, so it should NOT appear
      const newIds = newCases.cases.map((c) => c.caseId);
      expect(newIds).not.toContain('case-new-1');
    });
  });

  describe('FR-070 A4: HTML rendering', () => {
    let sections: BrdReportSection[];

    beforeEach(() => {
      reportService.setCases(buildTestCases());
      sections = reportService.buildBrdSections(buildTestCases(), now);
    });

    it('should produce valid HTML structure', () => {
      const html = reportService.renderHtml(sections);

      expect(html).toContain('<html>');
      expect(html).toContain('</html>');
      expect(html).toContain('<table');
      expect(html).toContain('</table>');
      expect(html).toContain('<thead>');
      expect(html).toContain('<tbody>');
    });

    it('should include all 4 section headings', () => {
      const html = reportService.renderHtml(sections);

      expect(html).toContain('Overdue');
      expect(html).toContain('Due Today');
      expect(html).toContain('New Since Last Report');
      expect(html).toContain('Approaching Deadline');
    });

    it('should include case numbers in table rows', () => {
      const html = reportService.renderHtml(sections);

      expect(html).toContain('ATL-2026-000001');
      expect(html).toContain('ATL-2026-000002');
    });

    it('should include case links as anchor tags', () => {
      const html = reportService.renderHtml(sections);

      expect(html).toContain('<a href=');
      expect(html).toContain('atlas.bank.internal/cases/');
    });

    it('should include column headers', () => {
      const html = reportService.renderHtml(sections);

      expect(html).toContain('<th>Case</th>');
      expect(html).toContain('<th>Type</th>');
      expect(html).toContain('<th>Status</th>');
      expect(html).toContain('<th>FPR</th>');
      expect(html).toContain('<th>Team</th>');
      expect(html).toContain('<th>TAT</th>');
    });

    it('should show overdue hours for overdue cases', () => {
      const html = reportService.renderHtml(sections);

      expect(html).toContain('overdue');
    });

    it('should handle empty sections gracefully', () => {
      const emptySections: BrdReportSection[] = [
        { title: 'Empty Section', cases: [] },
      ];

      const html = reportService.renderHtml(emptySections);
      expect(html).toContain('No cases in this section');
    });

    it('should escape HTML in case data', () => {
      const sectionsWithHtml: BrdReportSection[] = [
        {
          title: 'Test',
          cases: [
            {
              caseId: 'case-1',
              caseType: '<script>alert("xss")</script>',
              status: 'OPEN',
              createdAt: new Date(),
            },
          ],
        },
      ];

      const html = reportService.renderHtml(sectionsWithHtml);
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });

  describe('FR-070 A4: Plain text rendering', () => {
    let sections: BrdReportSection[];

    beforeEach(() => {
      reportService.setCases(buildTestCases());
      sections = reportService.buildBrdSections(buildTestCases(), now);
    });

    it('should produce aligned text output', () => {
      const text = reportService.renderPlainText(sections);

      expect(text).toContain('DAILY PENDENCY REPORT');
      expect(text).toContain('===');
    });

    it('should include all 4 section titles', () => {
      const text = reportService.renderPlainText(sections);

      expect(text).toContain('Overdue');
      expect(text).toContain('Due Today');
      expect(text).toContain('New Since Last Report');
      expect(text).toContain('Approaching Deadline');
    });

    it('should include case numbers', () => {
      const text = reportService.renderPlainText(sections);

      expect(text).toContain('ATL-2026-000001');
      expect(text).toContain('ATL-2026-000002');
    });

    it('should include column headers', () => {
      const text = reportService.renderPlainText(sections);

      expect(text).toContain('Case');
      expect(text).toContain('Type');
      expect(text).toContain('Status');
      expect(text).toContain('FPR');
      expect(text).toContain('TAT');
    });

    it('should handle empty sections', () => {
      const emptySections: BrdReportSection[] = [
        { title: 'Empty', cases: [] },
      ];

      const text = reportService.renderPlainText(emptySections);
      expect(text).toContain('No cases in this section');
    });

    it('should include hours overdue/remaining', () => {
      const text = reportService.renderPlainText(sections);

      expect(text).toMatch(/\d+(\.\d+)?h overdue/);
    });
  });

  describe('FR-070 A3: Case links', () => {
    it('should generate signed case links', () => {
      const link = reportService.generateCaseLink('case-123');

      expect(link).toContain('https://atlas.bank.internal/cases/case-123');
      expect(link).toContain('expires=');
      expect(link).toContain('sig=');
    });

    it('should generate unique signatures for different case IDs', () => {
      const link1 = reportService.generateCaseLink('case-1');
      const link2 = reportService.generateCaseLink('case-2');

      const sig1 = new URL(link1).searchParams.get('sig');
      const sig2 = new URL(link2).searchParams.get('sig');

      expect(sig1).not.toBe(sig2);
    });

    it('should include case links in BRD report entries', async () => {
      reportService.setCases(buildTestCases());
      const report = await reportService.generateBrdReport(now);

      const allCases = report.sections.flatMap((s) => s.cases);
      for (const c of allCases) {
        expect(c.caseLink).toBeDefined();
        expect(c.caseLink).toContain('https://atlas.bank.internal/cases/');
        expect(c.caseLink).toContain('sig=');
      }
    });

    it('should verify valid case links', () => {
      const link = reportService.generateCaseLink('case-verify');
      const url = new URL(link);
      const expires = parseInt(url.searchParams.get('expires')!, 10);
      const sig = url.searchParams.get('sig')!;

      const valid = PendencyReportService.verifyCaseLink('case-verify', expires, sig);
      expect(valid).toBe(true);
    });

    it('should reject tampered case links', () => {
      const link = reportService.generateCaseLink('case-verify');
      const url = new URL(link);
      const expires = parseInt(url.searchParams.get('expires')!, 10);

      const valid = PendencyReportService.verifyCaseLink('case-verify', expires, 'tampered-signature');
      expect(valid).toBe(false);
    });

    it('should reject case links with wrong case ID', () => {
      const link = reportService.generateCaseLink('case-original');
      const url = new URL(link);
      const expires = parseInt(url.searchParams.get('expires')!, 10);
      const sig = url.searchParams.get('sig')!;

      const valid = PendencyReportService.verifyCaseLink('case-different', expires, sig);
      expect(valid).toBe(false);
    });
  });

  describe('FR-070 A5: Multi-channel dispatch', () => {
    let processor: PendencyReportProcessor;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let sendSpy: jest.SpyInstance;

    beforeEach(async () => {
      // Setup schedules with multi-channel
      mockPrisma.pendencyReportSchedule.findMany.mockResolvedValue([
        {
          id: 'sched-1',
          recipient_role: 'COLLATERAL_LEAD',
          recipient_id: null,
          cron_expression: '0 30 3 * * *',
          channels: ['EMAIL', 'IN_APP', 'MS_TEAMS'],
          is_active: true,
          last_run_at: null,
          region: null,
          case_type: null,
        },
      ]);

      mockPrisma.pendencyReportSchedule.update.mockResolvedValue({});

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PendencyReportProcessor,
          PendencyReportService,
          NotificationDispatchService,
          { provide: PrismaService, useValue: mockPrisma },
        ],
      }).compile();

      processor = module.get(PendencyReportProcessor);
      dispatchService = module.get(NotificationDispatchService);
      reportService = module.get(PendencyReportService);
      reportService.setCases(buildTestCases());

      sendSpy = jest.spyOn(dispatchService, 'send');
    });

    it('should dispatch to all channels configured in the schedule', async () => {
      const mockJob = {
        id: 'job-1',
        data: { date: now.toISOString() },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await processor.process(mockJob as any);

      // Should have called send for each of the 3 channels
      expect(sendSpy).toHaveBeenCalledTimes(3);

      const channels = sendSpy.mock.calls.map(
        (call: unknown[]) => call[1],
      );
      expect(channels).toContain('EMAIL');
      expect(channels).toContain('IN_APP');
      expect(channels).toContain('MS_TEAMS');
    });

    it('should send HTML body for EMAIL channel and plain text for others', async () => {
      const mockJob = {
        id: 'job-2',
        data: { date: now.toISOString() },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await processor.process(mockJob as any);

      // Find the EMAIL send call
      const emailCall = sendSpy.mock.calls.find(
        (call: unknown[]) => call[1] === 'EMAIL',
      );
      expect(emailCall).toBeDefined();
      const emailVars = emailCall![3] as Record<string, unknown>;
      expect(emailVars.report_body).toBeDefined();
      expect(String(emailVars.report_body)).toContain('<html>');

      // Find the IN_APP send call
      const inAppCall = sendSpy.mock.calls.find(
        (call: unknown[]) => call[1] === 'IN_APP',
      );
      expect(inAppCall).toBeDefined();
      const inAppVars = inAppCall![3] as Record<string, unknown>;
      expect(String(inAppVars.report_body)).not.toContain('<html>');
    });

    it('should update last_run_at after processing', async () => {
      const mockJob = {
        id: 'job-3',
        data: { date: now.toISOString() },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await processor.process(mockJob as any);

      expect(mockPrisma.pendencyReportSchedule.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sched-1' },
          data: expect.objectContaining({
            last_run_at: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe('FR-071 A1: Schedule per region/case_type', () => {
    it('should accept region and caseType in scheduleReport', async () => {
      const schedule = await reportService.scheduleReport(
        '0 30 3 * * *',
        ['COLLATERAL_LEAD'],
        { region: 'NORTH' },
        { region: 'NORTH', caseType: 'VALUATION_REQUEST', channels: ['EMAIL', 'IN_APP'] },
      );

      expect(schedule.id).toBeDefined();
      expect(mockPrisma.pendencyReportSchedule.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            region: 'NORTH',
            case_type: 'VALUATION_REQUEST',
            channels: ['EMAIL', 'IN_APP'],
          }),
        }),
      );
    });

    it('should filter cases by region', () => {
      const cases = buildTestCases();
      const filtered = reportService.applyFilters(cases, { region: 'NORTH' });

      expect(filtered.length).toBeGreaterThan(0);
      for (const c of filtered) {
        expect(c.region).toBe('NORTH');
      }
    });

    it('should filter cases by caseType', () => {
      const cases = buildTestCases();
      const filtered = reportService.applyFilters(cases, { caseType: 'LEGAL_OPINION' });

      expect(filtered.length).toBeGreaterThan(0);
      for (const c of filtered) {
        expect(c.caseType).toBe('LEGAL_OPINION');
      }
    });

    it('should apply combined region and caseType filters', () => {
      const cases = buildTestCases();
      const filtered = reportService.applyFilters(cases, {
        region: 'SOUTH',
        caseType: 'LEGAL_OPINION',
      });

      expect(filtered.length).toBeGreaterThan(0);
      for (const c of filtered) {
        expect(c.region).toBe('SOUTH');
        expect(c.caseType).toBe('LEGAL_OPINION');
      }
    });

    it('should generate filtered BRD report by region', async () => {
      reportService.setCases(buildTestCases());
      const report = await reportService.generateBrdReport(now, { region: 'SOUTH' });

      const allCases = report.sections.flatMap((s) => s.cases);
      // No NORTH-region case should appear
      expect(allCases.every((c) => c.caseId !== 'case-due-today')).toBe(true);
    });
  });

  describe('generateDailyReport backward compatibility', () => {
    it('should still produce original format sections', async () => {
      reportService.setCases(buildTestCases());
      const report = await reportService.generateDailyReport(now);

      const sectionTitles = report.sections.map((s) => s.title);
      expect(sectionTitles).toContain('Open Cases by Status');
      expect(sectionTitles).toContain('Breached Cases by Team');
      expect(sectionTitles).toContain('Resolution Metrics');
    });

    it('should also include BRD sections in the report', async () => {
      reportService.setCases(buildTestCases());
      const report = await reportService.generateDailyReport(now);

      const sectionTitles = report.sections.map((s) => s.title);
      expect(sectionTitles).toContain('Overdue');
      expect(sectionTitles).toContain('Due Today');
      expect(sectionTitles).toContain('New Since Last Report');
      expect(sectionTitles).toContain('Approaching Deadline (next 24h)');
    });

    it('should compute summary correctly', async () => {
      reportService.setCases(buildTestCases());
      const report = await reportService.generateDailyReport(now);

      expect(report.summary).toBeDefined();
      expect(report.summary.totalOpenCases).toBeGreaterThan(0);
      expect(report.generatedAt).toBeInstanceOf(Date);
      expect(report.period.from).toBeInstanceOf(Date);
      expect(report.period.to).toBeInstanceOf(Date);
    });
  });

  describe('Pendency Report Processor basics', () => {
    let processor: PendencyReportProcessor;

    beforeEach(async () => {
      mockPrisma.pendencyReportSchedule.findMany.mockResolvedValue([]);
      mockPrisma.pendencyReportSchedule.update.mockResolvedValue({});

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          PendencyReportProcessor,
          PendencyReportService,
          NotificationDispatchService,
          { provide: PrismaService, useValue: mockPrisma },
        ],
      }).compile();

      processor = module.get(PendencyReportProcessor);
      reportService = module.get(PendencyReportService);
      reportService.setCases(buildTestCases());
    });

    it('should process without errors when no schedules exist', async () => {
      const mockJob = {
        id: 'job-no-schedules',
        data: { date: now.toISOString() },
      };

      // Should not throw
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(processor.process(mockJob as any)).resolves.toBeUndefined();
    });

    it('should handle schedule with region filter', async () => {
      mockPrisma.pendencyReportSchedule.findMany.mockResolvedValue([
        {
          id: 'sched-region',
          recipient_role: 'COLLATERAL_LEAD',
          recipient_id: 'user-lead-1',
          cron_expression: '0 30 3 * * *',
          channels: ['EMAIL'],
          is_active: true,
          last_run_at: null,
          region: 'NORTH',
          case_type: 'VALUATION_REQUEST',
        },
      ]);

      const mockJob = {
        id: 'job-region',
        data: { date: now.toISOString() },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(processor.process(mockJob as any)).resolves.toBeUndefined();

      // Should have updated last_run_at
      expect(mockPrisma.pendencyReportSchedule.update).toHaveBeenCalled();
    });
  });
});
