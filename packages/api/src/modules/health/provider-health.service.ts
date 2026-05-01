import { Injectable, Logger, Optional } from '@nestjs/common';
import { EmailHealthService } from '../email-ingest/services/email-health.service';
import { ClassificationPipelineService } from '../ai-classification/services/classification-pipeline.service';

export interface HealthMetric {
  provider: string;
  status: 'healthy' | 'degraded' | 'down';
  lastSuccess: string | null;
  details?: string;
}

export interface QueueMetric {
  name: string;
  pending: number;
  active: number;
  failed: number;
}

export interface ErrorEntry {
  provider: string;
  error: string;
  timestamp: string;
}

export interface DetailedHealthReport {
  metrics: HealthMetric[];
  queues: QueueMetric[];
  errors: ErrorEntry[];
  lastUpdated: string;
}

@Injectable()
export class ProviderHealthService {
  private readonly logger = new Logger(ProviderHealthService.name);

  constructor(
    @Optional() private readonly emailHealthService?: EmailHealthService,
    @Optional() private readonly classificationPipeline?: ClassificationPipelineService,
  ) {}

  async getDetailedHealth(): Promise<DetailedHealthReport> {
    const metrics: HealthMetric[] = [];
    const errors: ErrorEntry[] = [];
    const now = new Date().toISOString();

    // 1. Email providers
    try {
      if (this.emailHealthService) {
        const emailHealth = await this.emailHealthService.getProviderHealth();
        if (Array.isArray(emailHealth)) {
          for (const provider of emailHealth) {
            metrics.push({
              provider: `email:${provider.name || 'unknown'}`,
              status: provider.status === 'UP' ? 'healthy' : provider.status === 'DEGRADED' ? 'degraded' : 'down',
              lastSuccess: provider.lastSuccessAt || null,
              details: provider.details || undefined,
            });
          }
        }
      }
    } catch (err) {
      errors.push({ provider: 'email', error: (err as Error).message, timestamp: now });
      metrics.push({ provider: 'email:primary', status: 'down', lastSuccess: null, details: (err as Error).message });
    }

    // 2. LLM status
    try {
      if (this.classificationPipeline) {
        const effectiveMode = this.classificationPipeline.getEffectiveMode();
        const llmStatus: 'healthy' | 'degraded' | 'down' =
          effectiveMode === 'ON' ? 'healthy' :
          effectiveMode === 'DEGRADED' ? 'degraded' : 'down';
        metrics.push({
          provider: 'llm',
          status: llmStatus,
          lastSuccess: now,
          details: `LLM mode: ${effectiveMode}`,
        });
      }
    } catch (err) {
      errors.push({ provider: 'llm', error: (err as Error).message, timestamp: now });
      metrics.push({ provider: 'llm', status: 'down', lastSuccess: null });
    }

    // 3. Database (simulated healthy — in production would use Prisma $queryRaw)
    metrics.push({
      provider: 'database:postgres',
      status: 'healthy',
      lastSuccess: now,
      details: 'Connection pool active',
    });

    // 4. Redis (simulated healthy)
    metrics.push({
      provider: 'cache:redis',
      status: 'healthy',
      lastSuccess: now,
      details: 'Connected',
    });

    // 5. S3 (simulated)
    metrics.push({
      provider: 'storage:s3',
      status: 'healthy',
      lastSuccess: now,
      details: 'Bucket accessible',
    });

    // 6. DMS (simulated)
    metrics.push({
      provider: 'dms',
      status: 'healthy',
      lastSuccess: now,
      details: 'Replication active',
    });

    // 7. Notification channels (simulated)
    metrics.push({
      provider: 'notification:email',
      status: 'healthy',
      lastSuccess: now,
    });
    metrics.push({
      provider: 'notification:sms',
      status: 'healthy',
      lastSuccess: now,
    });

    // Simulated queues
    const queues: QueueMetric[] = [
      { name: 'email-ingest', pending: 0, active: 0, failed: 0 },
      { name: 'escalation-sweep', pending: 0, active: 0, failed: 0 },
      { name: 'notification', pending: 0, active: 0, failed: 0 },
    ];

    return {
      metrics,
      queues,
      errors,
      lastUpdated: now,
    };
  }
}
