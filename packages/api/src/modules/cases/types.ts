/**
 * Case module types — BRD Module D (FR-030 through FR-035).
 */

export enum CaseStatus {
  NEW = 'NEW',
  CLASSIFIED = 'CLASSIFIED',
  ROUTED = 'ROUTED',
  AWAITING_FPR = 'AWAITING_FPR',
  AWAITING_FIELD_DISAMBIGUATION = 'AWAITING_FIELD_DISAMBIGUATION',
  IN_PROGRESS = 'IN_PROGRESS',
  ON_HOLD = 'ON_HOLD',
  AWAITING_VENDOR = 'AWAITING_VENDOR',
  VENDOR_COMPLETED = 'VENDOR_COMPLETED',
  REVIEW = 'REVIEW',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
  REOPENED = 'REOPENED',
  CANCELLED = 'CANCELLED',
  MANUAL_ROUTING = 'MANUAL_ROUTING',
}

/**
 * Valid state transitions for case lifecycle.
 */
export const VALID_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  [CaseStatus.NEW]: [CaseStatus.CLASSIFIED, CaseStatus.CANCELLED],
  [CaseStatus.CLASSIFIED]: [CaseStatus.ROUTED, CaseStatus.AWAITING_FIELD_DISAMBIGUATION, CaseStatus.CANCELLED],
  [CaseStatus.ROUTED]: [CaseStatus.AWAITING_FPR, CaseStatus.CANCELLED],
  [CaseStatus.AWAITING_FPR]: [CaseStatus.IN_PROGRESS, CaseStatus.ROUTED, CaseStatus.CANCELLED],
  [CaseStatus.AWAITING_FIELD_DISAMBIGUATION]: [CaseStatus.CLASSIFIED, CaseStatus.ROUTED, CaseStatus.CANCELLED],
  [CaseStatus.IN_PROGRESS]: [CaseStatus.AWAITING_VENDOR, CaseStatus.ON_HOLD, CaseStatus.REVIEW, CaseStatus.CANCELLED],
  [CaseStatus.ON_HOLD]: [CaseStatus.IN_PROGRESS, CaseStatus.CANCELLED],
  [CaseStatus.AWAITING_VENDOR]: [CaseStatus.VENDOR_COMPLETED, CaseStatus.IN_PROGRESS, CaseStatus.CANCELLED],
  [CaseStatus.VENDOR_COMPLETED]: [CaseStatus.REVIEW, CaseStatus.IN_PROGRESS],
  [CaseStatus.REVIEW]: [CaseStatus.RESOLVED, CaseStatus.IN_PROGRESS],
  [CaseStatus.RESOLVED]: [CaseStatus.CLOSED],
  [CaseStatus.CLOSED]: [CaseStatus.REOPENED],
  [CaseStatus.REOPENED]: [CaseStatus.IN_PROGRESS, CaseStatus.CANCELLED],
  [CaseStatus.CANCELLED]: [],
  [CaseStatus.MANUAL_ROUTING]: [CaseStatus.ROUTED, CaseStatus.CANCELLED],
};

/**
 * Maximum number of days after closure within which a case can be reopened.
 */
export const REOPEN_WINDOW_DAYS = 60;

/**
 * Number of days a case must be in RESOLVED status before auto-closing.
 */
export const AUTO_CLOSE_RESOLVED_DAYS = 30;

export interface CaseRecord {
  id: string;
  caseNumber: string;
  emailIngestId: string;
  subject: string;
  from: string;
  /** Original ingested email — for displaying the raw message on case detail. */
  emailSubject?: string;
  emailFrom?: string;
  bodyText?: string;
  bodyHtml?: string;
  status: CaseStatus;
  caseType: string;
  priority: string;
  assignedFprId?: string;
  assignedFprName?: string;
  assignedVendorId?: string;
  propertyCity?: string;
  propertyPin?: string;
  loanAccountNo?: string;
  customerName?: string;
  tatTargetAt?: Date;
  confidenceBand: string;
  languageDetected: string;
  createdAt: Date;
  updatedAt: Date;
  closedAt?: Date;
  activityLog: ActivityLogEntry[];
  linkedCaseIds: string[];
}

export interface ActivityLogEntry {
  id: string;
  timestamp: Date;
  action: string;
  fromStatus?: CaseStatus;
  toStatus?: CaseStatus;
  performedBy: string;
  details?: string;
}

export interface FprRecord {
  id: string;
  name: string;
  email: string;
  skills: string[];
  propertyZones: string[];
  caseTypes: string[];
  capacityPerDay: number;
  openCaseCount: number;
  isOoo: boolean;
  delegateId?: string;
  supervisorId?: string;
}

export interface VendorRecord {
  id: string;
  name: string;
  geographies: string[];
  caseTypes: string[];
  avgTatDays: number;
  scorecardRating: number;
  activeJobs: number;
}

export interface RoutingResult {
  fprId: string;
  fprName: string;
  reason: string;
  fallbackChain?: string[];
  /** The routing key tier that matched (e.g. 'PIN', 'CITY', 'ZONE', 'REGION') */
  matchedTier?: string;
  /** Canonical values used in the lookup chain */
  resolvedKeys?: {
    caseType?: string;
    propertyPin?: string;
    propertyCity?: string;
    zone?: string;
    region?: string;
  };
  /** Match types returned by CanonicalLookupService for each key */
  lookupMatchTypes?: Record<string, string>;
  /** Workload ratio of the selected FPR */
  workloadRatio?: number;
}

export interface RoutingFailure {
  success: false;
  reason: string;
  failedTier: string;
  resolvedKeys?: Record<string, string | undefined>;
  lookupMatchTypes?: Record<string, string>;
  fallbackChain?: string[];
}

export interface VendorSelectionResult {
  vendorId: string;
  vendorName: string;
  reason: string;
}
