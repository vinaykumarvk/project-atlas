export enum NotificationChannel {
  EMAIL = 'EMAIL',
  IN_APP = 'IN_APP',
  MS_TEAMS = 'MS_TEAMS',
  SMS = 'SMS',
  WHATSAPP = 'WHATSAPP',
  SLACK = 'SLACK',
  PUSH = 'PUSH',
  BROWSER_PUSH = 'BROWSER_PUSH',
}

export interface NotificationTemplate {
  code: string;
  subject: string;
  body: string;
}

export interface NotificationRecord {
  id: string;
  recipientId: string;
  channel: NotificationChannel;
  templateCode: string;
  variables: Record<string, unknown>;
  renderedSubject: string;
  renderedBody: string;
  sentAt: Date;
  status: 'SENT' | 'SUPPRESSED' | 'FAILED' | 'BOUNCED' | 'PROPOSED';
}

export interface DigestItem {
  templateCode: string;
  variables: Record<string, string>;
  renderedSubject: string;
  renderedBody: string;
  addedAt: Date;
}

export interface DigestBatch {
  recipientId: string;
  items: DigestItem[];
  windowStartedAt: Date;
}

export interface ReportSection {
  title: string;
  data: Record<string, unknown>;
}

export interface PendencyReport {
  generatedAt: Date;
  period: { from: Date; to: Date };
  summary: {
    totalOpenCases: number;
    statusBreakdown: Record<string, number>;
    breachedCasesByTeam: Record<string, number>;
    breachedCasesByFpr: Record<string, number>;
    averageResolutionTimeHours: number;
    newCasesToday: number;
    newCasesYesterday: number;
  };
  sections: ReportSection[];
}

export interface ScheduledReport {
  id: string;
  cron: string;
  recipients: string[];
  filters?: ReportFilters;
}

export interface ReportFilters {
  team?: string;
  fprId?: string;
  status?: string;
  caseType?: string;
  region?: string;
}

/**
 * A single case entry for BRD-compliant pendency report sections.
 */
export interface PendencyCaseEntry {
  caseId: string;
  caseNumber?: string;
  caseType: string;
  status: string;
  fprName?: string;
  team?: string;
  createdAt: Date;
  tatTargetAt?: Date;
  hoursOverdue?: number;
  hoursRemaining?: number;
  caseLink?: string;
}

/**
 * BRD-compliant pendency report section with typed case entries.
 */
export interface BrdReportSection {
  title: string;
  cases: PendencyCaseEntry[];
}

/**
 * BRD-compliant pendency report with 4 sections.
 */
export interface BrdPendencyReport {
  generatedAt: Date;
  period: { from: Date; to: Date };
  sections: BrdReportSection[];
  summary: {
    totalOverdue: number;
    totalDueToday: number;
    totalNewSinceLastReport: number;
    totalApproachingDeadline: number;
  };
  html?: string;
  plainText?: string;
}
