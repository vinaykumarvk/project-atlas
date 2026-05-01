import { Module } from '@nestjs/common';
import { LmsLookupService, MockLmsProvider } from './services/lms-lookup.service';
import { LmsSftpService } from './services/lms-sftp.service';
import { DmsService, MockDmsProvider } from './services/dms.service';
import { CrmIntegrationService } from './services/crm-integration.service';
import { CbsService, MockCbsProvider } from './services/cbs.service';

@Module({
  providers: [
    LmsLookupService,
    LmsSftpService,
    DmsService,
    CrmIntegrationService,
    CbsService,
    { provide: 'LmsProvider', useClass: MockLmsProvider },
    { provide: 'DmsProvider', useClass: MockDmsProvider },
    { provide: 'CbsProvider', useClass: MockCbsProvider },
  ],
  exports: [
    LmsLookupService,
    LmsSftpService,
    DmsService,
    CrmIntegrationService,
    CbsService,
  ],
})
export class IntegrationsModule {}
