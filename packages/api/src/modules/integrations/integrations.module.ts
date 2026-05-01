import { Module } from '@nestjs/common';
import { LmsLookupService, MockLmsProvider } from './services/lms-lookup.service';
import { LmsSftpService } from './services/lms-sftp.service';
import { DmsService, MockDmsProvider } from './services/dms.service';
import { CrmIntegrationService } from './services/crm-integration.service';

@Module({
  providers: [
    LmsLookupService,
    LmsSftpService,
    DmsService,
    CrmIntegrationService,
    { provide: 'LmsProvider', useClass: MockLmsProvider },
    { provide: 'DmsProvider', useClass: MockDmsProvider },
  ],
  exports: [
    LmsLookupService,
    LmsSftpService,
    DmsService,
    CrmIntegrationService,
  ],
})
export class IntegrationsModule {}
