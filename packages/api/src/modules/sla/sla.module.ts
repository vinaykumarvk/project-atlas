import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { SlaClockService } from './services/sla-clock.service';
import { EscalationService } from './services/escalation.service';
import { SlaDashboardService } from './services/sla-dashboard.service';
import { EscalationSweepProcessor } from './processors/escalation-sweep.processor';
import { AutoCloseSweepProcessor } from './processors/auto-close-sweep.processor';
import { SlaController } from './controllers/sla.controller';
import { ODataController } from './controllers/odata.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { SloBurnRateService } from './services/slo-burnrate.service';
import { PredictiveBreachService } from './services/predictive-breach.service';
import { WorkloadForecastService } from './services/workload-forecast.service';
import { CustomReportService } from './services/custom-report.service';
import { HeatmapService } from './services/heatmap.service';
import { BusinessValueService } from './services/business-value.service';
import { VolumeAnomalyService } from './services/volume-anomaly.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'escalation-sweep' }),
    NotificationsModule,
  ],
  controllers: [SlaController, ODataController],
  providers: [
    SlaClockService,
    EscalationService,
    SlaDashboardService,
    EscalationSweepProcessor,
    AutoCloseSweepProcessor,
    SloBurnRateService,
    PredictiveBreachService,
    WorkloadForecastService,
    CustomReportService,
    HeatmapService,
    BusinessValueService,
    VolumeAnomalyService,
  ],
  exports: [
    SlaClockService,
    EscalationService,
    SlaDashboardService,
    SloBurnRateService,
    PredictiveBreachService,
    WorkloadForecastService,
    CustomReportService,
    HeatmapService,
    BusinessValueService,
    AutoCloseSweepProcessor,
    VolumeAnomalyService,
  ],
})
export class SlaModule {}
