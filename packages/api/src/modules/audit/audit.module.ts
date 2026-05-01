import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditLogService } from './services/audit-log.service';
import { PiiRedactionService } from './services/pii-redaction.service';
import { AuditReplicationService } from './services/audit-replication.service';
import { PromptRedactionService } from './services/prompt-redaction.service';
import { AuditInterceptor } from './interceptors/audit.interceptor';

/**
 * Global Audit Module.
 *
 * Provides:
 * - AuditLogService  — append-only, hash-chained audit log
 * - PiiRedactionService — PII detection and deterministic redaction
 * - AuditReplicationService — WORM S3 replication for audit entries (FR-126.A3)
 * - PromptRedactionService — AI prompt PII redaction (FR-123.A2-A3)
 * - AuditInterceptor — automatically logs requests for @Audited() endpoints
 *
 * Being @Global(), these services can be injected anywhere without
 * needing to import AuditModule explicitly.
 */
@Global()
@Module({
  providers: [
    AuditLogService,
    PiiRedactionService,
    AuditReplicationService,
    PromptRedactionService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
  exports: [AuditLogService, PiiRedactionService, AuditReplicationService, PromptRedactionService],
})
export class AuditModule {}
