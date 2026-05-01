// Project Atlas — Shared Types & Enums

// Case statuses per BRD Section 9.1
export enum CaseStatus {
  NEW = 'NEW',
  CLASSIFIED = 'CLASSIFIED',
  ROUTED = 'ROUTED',
  AWAITING_FPR = 'AWAITING_FPR',
  AWAITING_VENDOR = 'AWAITING_VENDOR',
  AWAITING_BUSINESS = 'AWAITING_BUSINESS',
  IN_REVIEW = 'IN_REVIEW',
  ESCALATED = 'ESCALATED',
  ON_HOLD = 'ON_HOLD',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
  CANCELLED = 'CANCELLED',
}

// Email ingest statuses
export enum IngestStatus {
  RECEIVED = 'RECEIVED',
  DUPLICATE = 'DUPLICATE',
  AUTO_REPLY = 'AUTO_REPLY',
  QUARANTINED = 'QUARANTINED',
  PROCESSING = 'PROCESSING',
  CLASSIFIED = 'CLASSIFIED',
  FAILED = 'FAILED',
}

// Confidence bands per FR-015
export enum ConfidenceBand {
  GREEN = 'GREEN', // >= 0.90
  AMBER = 'AMBER', // 0.75 - 0.89
  RED = 'RED', // 0.50 - 0.74
  RED_MANUAL = 'RED_MANUAL', // < 0.50
}

// Priority levels
export enum Priority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

// LLM operational modes per FR-128
export enum LlmMode {
  ON = 'ON',
  DEGRADED = 'DEGRADED',
  OFF = 'OFF',
}

// Master validation outcomes per FR-016
export enum ValidationOutcome {
  PASS = 'PASS',
  FUZZY_MATCH = 'FUZZY_MATCH',
  FAIL = 'FAIL',
}

// Notification channels
export enum NotificationChannel {
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  WHATSAPP = 'WHATSAPP',
  TEAMS = 'TEAMS',
  IN_APP = 'IN_APP',
  PUSH = 'PUSH',
  SLACK = 'SLACK',
}

// User roles per BRD Section 3
export enum UserRole {
  BUSINESS_TEAM_USER = 'BUSINESS_TEAM_USER',
  COLLATERAL_OFFICER = 'COLLATERAL_OFFICER',
  COLLATERAL_LEAD = 'COLLATERAL_LEAD',
  COLLATERAL_HEAD = 'COLLATERAL_HEAD',
  FPR = 'FPR',
  FPR_SUPERVISOR = 'FPR_SUPERVISOR',
  VENDOR = 'VENDOR',
  MASTER_DATA_ADMIN = 'MASTER_DATA_ADMIN',
  MASTER_DATA_APPROVER = 'MASTER_DATA_APPROVER',
  SYS_ADMIN = 'SYS_ADMIN',
  COMPLIANCE_OFFICER = 'COMPLIANCE_OFFICER',
  MLOPS = 'MLOPS',
  API_SERVICE_ACCOUNT = 'API_SERVICE_ACCOUNT',
}

// Document types per FR-022
export enum DocumentType {
  VALUATION_REPORT = 'VALUATION_REPORT',
  LEGAL_OPINION = 'LEGAL_OPINION',
  RC_COPY = 'RC_COPY',
  ENCUMBRANCE_CERT = 'ENCUMBRANCE_CERT',
  PHOTO = 'PHOTO',
  INVOICE = 'INVOICE',
  ID_PROOF = 'ID_PROOF',
  OTHER = 'OTHER',
}

// Maker-checker status
export enum MasterChangeStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

// Standard API error codes per BRD Section 7.2
export enum ErrorCode {
  AUTH_REQUIRED = 'AUTH_REQUIRED',
  AUTH_FORBIDDEN = 'AUTH_FORBIDDEN',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMITED = 'RATE_LIMITED',
  UPSTREAM_TIMEOUT = 'UPSTREAM_TIMEOUT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

// Standard API error response shape
export interface ApiError {
  error: {
    code: ErrorCode;
    message: string;
    field?: string;
    trace_id: string;
    details?: unknown[];
  };
}
