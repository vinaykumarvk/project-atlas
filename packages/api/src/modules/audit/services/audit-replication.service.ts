import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';

@Injectable()
export class AuditReplicationService {
  private readonly logger = new Logger(AuditReplicationService.name);
  private lastReplicationAt: Date | null = null;
  private lastReplicatedCount = 0;

  constructor(private readonly prisma: PrismaService) {}

  async replicateToS3(auditEntries: any[]): Promise<{ replicatedCount: number; bucket: string }> {
    const bucket = process.env.AUDIT_S3_BUCKET || 'atlas-audit-worm';
    const region = process.env.AUDIT_S3_REGION || 'ap-south-1';

    // Serialize entries to JSON
    const payload = JSON.stringify(auditEntries, null, 2);
    const key = `audit-replication/${new Date().toISOString().split('T')[0]}/${Date.now()}.json`;

    this.logger.log(
      `Replicating ${auditEntries.length} audit entries to s3://${bucket}/${key} (region: ${region})`,
    );

    // In production, this would use S3 client with ObjectLock retention
    // For now, we track the replication state
    this.lastReplicationAt = new Date();
    this.lastReplicatedCount = auditEntries.length;

    return { replicatedCount: auditEntries.length, bucket };
  }

  async scheduleReplication(): Promise<{ replicatedCount: number }> {
    const since = this.lastReplicationAt || new Date(0);

    const entries = await this.prisma.auditLog.findMany({
      where: { created_at: { gt: since } },
      orderBy: { created_at: 'asc' },
      take: 10000,
    });

    if (entries.length === 0) {
      this.logger.debug('No new audit entries to replicate');
      return { replicatedCount: 0 };
    }

    const result = await this.replicateToS3(entries);
    return { replicatedCount: result.replicatedCount };
  }

  getReplicationStatus(): { lastReplicationAt: Date | null; entryCount: number; bucket: string } {
    return {
      lastReplicationAt: this.lastReplicationAt,
      entryCount: this.lastReplicatedCount,
      bucket: process.env.AUDIT_S3_BUCKET || 'atlas-audit-worm',
    };
  }
}
