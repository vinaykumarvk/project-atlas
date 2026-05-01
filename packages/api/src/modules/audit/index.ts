export { AuditModule } from './audit.module';
export { AuditLogService } from './services/audit-log.service';
export { PiiRedactionService } from './services/pii-redaction.service';
export { AuditInterceptor } from './interceptors/audit.interceptor';
export { Audited, AuditedOptions, AUDITED_KEY } from './decorators/audited.decorator';
export type {
  AuditEvent,
  AuditLogEntry,
  AuditQueryFilters,
  PaginatedAuditLogs,
  ChainVerificationResult,
} from './services/audit-log.service';
