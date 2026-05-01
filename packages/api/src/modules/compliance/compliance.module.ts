import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConsentLedgerService } from './services/consent-ledger.service';
import { ConsentRenewalService } from './services/consent-renewal.service';
import { DsrService } from './services/dsr.service';
import { CrossBorderApprovalService } from './services/cross-border-approval.service';
import { AsvsEvidenceService } from './services/asvs-evidence.service';
import { RegulatoryEvidenceService } from './services/regulatory-evidence.service';
import { BreachNotificationService } from './services/breach-notification.service';
import { BreachNotificationProcessor } from './processors/breach-notification.processor';
import { ComplianceController } from './controllers/compliance.controller';
import { AiClassificationModule } from '../ai-classification/ai-classification.module';

/**
 * Compliance Module.
 *
 * Provides:
 * - ConsentLedgerService — consent tracking (DPDP Act)
 * - DsrService — Data Subject Request handling
 * - CrossBorderApprovalService — cross-border data transfer approvals (FR-121.A2)
 * - AsvsEvidenceService — OWASP ASVS 4.0 evidence generation (FR-127.A3)
 * - ComplianceController — REST endpoints for compliance operations
 *
 * Depends on AuditModule (global) for audit log queries.
 */
@Module({
  imports: [
    AiClassificationModule,
    BullModule.registerQueue({ name: 'breach-notification' }),
  ],
  controllers: [ComplianceController],
  providers: [
    ConsentLedgerService,
    ConsentRenewalService,
    DsrService,
    CrossBorderApprovalService,
    AsvsEvidenceService,
    RegulatoryEvidenceService,
    BreachNotificationService,
    BreachNotificationProcessor,
  ],
  exports: [
    ConsentLedgerService,
    ConsentRenewalService,
    DsrService,
    CrossBorderApprovalService,
    AsvsEvidenceService,
    RegulatoryEvidenceService,
    BreachNotificationService,
  ],
})
export class ComplianceModule {}
