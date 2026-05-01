import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { EmailIngestModule } from '../email-ingest/email-ingest.module';
import { EmailHealthService } from '../email-ingest/services/email-health.service';
import { ProviderHealthService } from './provider-health.service';
import { MetricsService } from './metrics.service';
import { AiClassificationModule } from '../ai-classification/ai-classification.module';

@Module({
  imports: [EmailIngestModule, AiClassificationModule],
  controllers: [HealthController],
  providers: [EmailHealthService, ProviderHealthService, MetricsService],
  exports: [MetricsService],
})
export class HealthModule {}
