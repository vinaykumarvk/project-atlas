import { Global, Module } from '@nestjs/common';
import { MakerCheckerService } from './services/maker-checker.service';
import { EffectiveDatingService } from './services/effective-dating.service';
import { BulkImportService } from './services/bulk-import.service';
import { CanonicalLookupService } from './services/canonical-lookup.service';
import { MasterChangeReportService } from './services/master-change-report.service';
import { MastersController } from './controllers/masters.controller';

/**
 * Master Data Management module.
 *
 * Provides:
 * - Maker-checker workflow for all master data changes (four-eyes principle)
 * - Effective dating / temporal queries
 * - Bulk CSV/Excel import with validation
 * - Canonical lookup / master data matching
 * - Generic REST API for all master tables
 * - Master change report generation (FR-114)
 */
@Global()
@Module({
  controllers: [MastersController],
  providers: [
    MakerCheckerService,
    EffectiveDatingService,
    BulkImportService,
    CanonicalLookupService,
    MasterChangeReportService,
  ],
  exports: [
    MakerCheckerService,
    EffectiveDatingService,
    BulkImportService,
    CanonicalLookupService,
    MasterChangeReportService,
  ],
})
export class MastersModule {}
