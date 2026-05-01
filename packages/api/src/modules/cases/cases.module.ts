import { Module } from '@nestjs/common';
import { CaseCreationService } from './services/case-creation.service';
import { StateMachineService } from './services/state-machine.service';
import { RoutingService } from './services/routing.service';
import { VendorSelectionService } from './services/vendor-selection.service';
import { AutoAckService } from './services/auto-ack.service';
import { CollateralRiskService } from './services/collateral-risk.service';
import { VendorScorecardService } from './services/vendor-scorecard.service';
import { VendorResponseService } from './services/vendor-response.service';
import { CaseMergeService } from './services/case-merge.service';
import { CaseLifecycleHooksService } from './services/case-lifecycle-hooks.service';
import { InternalNotesService } from './services/internal-notes.service';
import { SemanticSearchService } from './services/semantic-search.service';
import { CasesController } from './controllers/cases.controller';
import { TriageController } from './controllers/triage.controller';
import { VendorsController } from './controllers/vendors.controller';
import { MastersModule } from '../masters/masters.module';

@Module({
  imports: [MastersModule],
  controllers: [CasesController, TriageController, VendorsController],
  providers: [
    CaseCreationService,
    StateMachineService,
    RoutingService,
    VendorSelectionService,
    AutoAckService,
    CollateralRiskService,
    VendorScorecardService,
    VendorResponseService,
    CaseMergeService,
    CaseLifecycleHooksService,
    InternalNotesService,
    SemanticSearchService,
  ],
  exports: [CaseCreationService, RoutingService, VendorSelectionService, StateMachineService, CollateralRiskService, CaseMergeService, CaseLifecycleHooksService, InternalNotesService, SemanticSearchService],
})
export class CasesModule {}
