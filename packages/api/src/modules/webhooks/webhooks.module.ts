import { Module } from '@nestjs/common';
import { WebhooksController } from './controllers/webhooks.controller';
import { WebhookDispatcherService } from './services/webhook-dispatcher.service';

@Module({
  controllers: [WebhooksController],
  providers: [WebhookDispatcherService],
  exports: [WebhookDispatcherService],
})
export class WebhooksModule {}
