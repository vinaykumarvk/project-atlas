import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationDispatchService } from './services/notification-dispatch.service';
import { PendencyReportService } from './services/pendency-report.service';
import { DigestService } from './services/digest.service';
import { NotificationsController } from './controllers/notifications.controller';
import { NotificationTemplatesController } from './controllers/notification-templates.controller';
import { PendencyController } from './controllers/pendency.controller';
import { SmsTransport } from './transports/sms.transport';
import { WhatsAppTransport } from './transports/whatsapp.transport';
import { NotificationRetryProcessor } from './processors/notification-retry.processor';
import { PendencyReportProcessor } from './processors/pendency-report.processor';
import { PiiLintService } from './services/pii-lint.service';
import { PagerDutyService } from './services/pagerduty.service';
import { OutboundReviewService } from './services/outbound-review.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'notification-retry' }),
    BullModule.registerQueue({ name: 'pendency-report' }),
  ],
  controllers: [NotificationsController, NotificationTemplatesController, PendencyController],
  providers: [
    NotificationDispatchService,
    PendencyReportService,
    DigestService,
    SmsTransport,
    WhatsAppTransport,
    NotificationRetryProcessor,
    PendencyReportProcessor,
    PiiLintService,
    PagerDutyService,
    OutboundReviewService,
  ],
  exports: [
    NotificationDispatchService,
    OutboundReviewService,
    PendencyReportService,
    DigestService,
    SmsTransport,
    WhatsAppTransport,
    PiiLintService,
    PagerDutyService,
  ],
})
export class NotificationsModule {}
