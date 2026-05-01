import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EmailIngestService } from './email-ingest.service';
import { GraphMailProvider } from './providers/graph.provider';
import { GmailMailProvider } from './providers/gmail.provider';
import { SpamProcessor } from './processors/spam.processor';
import { ThreadProcessor } from './processors/thread.processor';
import { LanguageProcessor } from './processors/language.processor';
import { IntakeProcessor } from './processors/intake.processor';
import { AvScanProcessor } from './processors/av-scan.processor';
import { EmailIngestController } from './controllers/email-ingest.controller';
import { IntakeOrchestratorService } from './services/intake-orchestrator.service';
import { AttachmentService } from './services/attachment.service';
import { AvScannerService } from './services/av-scanner.service';
import { OcrService } from './services/ocr.service';
import { DocumentClassifierService } from './services/document-classifier.service';
import { FieldExtractorService } from './services/field-extractor.service';
import { ObjectStorageService } from '../../common/services/object-storage.service';
import { EncryptionService } from '../../common/services/encryption.service';
import { AiClassificationModule } from '../ai-classification/ai-classification.module';
import { CasesModule } from '../cases/cases.module';
import { SlaModule } from '../sla/sla.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BounceDetectorService } from './services/bounce-detector.service';
import { ImapProvider } from './providers/imap.provider';
import { DualPollOrchestratorService } from './services/dual-poll-orchestrator.service';
import { MxSwapConfigService } from './config/mx-swap.config';
import { LinkProtectionProcessor } from './processors/link-protection.processor';
import { DedupDetectorService } from './services/dedup-detector.service';
import { CachedDataService } from './services/cached-data.service';
import { QuarantinePurgeService } from './services/quarantine-purge.service';

@Module({
  imports: [
    AiClassificationModule,
    CasesModule,
    SlaModule,
    NotificationsModule,
    BullModule.registerQueue({ name: 'intake' }),
    BullModule.registerQueue({ name: 'av-scan' }),
  ],
  controllers: [EmailIngestController],
  providers: [
    EmailIngestService,
    GraphMailProvider,
    GmailMailProvider,
    SpamProcessor,
    ThreadProcessor,
    LanguageProcessor,
    IntakeProcessor,
    AvScanProcessor,
    IntakeOrchestratorService,
    AttachmentService,
    AvScannerService,
    OcrService,
    DocumentClassifierService,
    FieldExtractorService,
    ObjectStorageService,
    EncryptionService,
    BounceDetectorService,
    ImapProvider,
    DualPollOrchestratorService,
    MxSwapConfigService,
    LinkProtectionProcessor,
    DedupDetectorService,
    CachedDataService,
    QuarantinePurgeService,
  ],
  exports: [
    EmailIngestService,
    GraphMailProvider,
    IntakeOrchestratorService,
    AttachmentService,
    AvScannerService,
    OcrService,
    DocumentClassifierService,
    FieldExtractorService,
    BounceDetectorService,
    ImapProvider,
    DualPollOrchestratorService,
    MxSwapConfigService,
    LinkProtectionProcessor,
    DedupDetectorService,
    CachedDataService,
    QuarantinePurgeService,
  ],
})
export class EmailIngestModule {}
