import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './common/prisma';
import { HealthModule } from './modules/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { EmailIngestModule } from './modules/email-ingest/email-ingest.module';
import { CasesModule } from './modules/cases/cases.module';
import { AiClassificationModule } from './modules/ai-classification/ai-classification.module';
import { SlaModule } from './modules/sla/sla.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AuditModule } from './modules/audit/audit.module';
import { MastersModule } from './modules/masters/masters.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { AdminModule } from './modules/admin/admin.module';
import { SessionMiddleware } from './modules/auth/bff/session.middleware';

// Infrastructure providers
import { ManifestVerificationService } from './common/services/manifest-verification.service';
import { BackupConfigService } from './common/config/backup.config';
import { ObjectLockConfigService } from './common/config/object-lock.config';
import { DrDrillService } from './common/services/dr-drill.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
      },
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    EmailIngestModule,
    CasesModule,
    AiClassificationModule,
    SlaModule,
    NotificationsModule,
    AuditModule,
    MastersModule,
    ComplianceModule,
    WebhooksModule,
    IntegrationsModule,
    AdminModule,
  ],
  providers: [
    // Infrastructure & DevOps
    ManifestVerificationService,
    BackupConfigService,
    ObjectLockConfigService,
    DrDrillService,
  ],
  exports: [
    ManifestVerificationService,
    BackupConfigService,
    ObjectLockConfigService,
    DrDrillService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SessionMiddleware).forRoutes('*');
  }
}
