import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ObjectLockPolicy {
  bucket: string;
  mode: 'GOVERNANCE' | 'COMPLIANCE';
  retentionDays: number;
  enabled: boolean;
}

@Injectable()
export class ObjectLockConfigService {
  private policies: ObjectLockPolicy[] = [];

  constructor(private readonly configService: ConfigService) {
    this.loadPolicies();
  }

  getPolicyForBucket(bucket: string): ObjectLockPolicy | undefined {
    return this.policies.find((p) => p.bucket === bucket);
  }

  isLocked(bucket: string): boolean {
    const policy = this.getPolicyForBucket(bucket);
    return policy !== undefined && policy.enabled;
  }

  getAllPolicies(): ObjectLockPolicy[] {
    return [...this.policies];
  }

  /**
   * FR-126.A3: Get the S3 replication configuration for audit log archival.
   *
   * Returns the source and destination buckets, replication schedule,
   * and whether replication is currently enabled.
   */
  getReplicationConfig(): {
    sourceBucket: string;
    destinationBucket: string;
    schedule: string;
    enabled: boolean;
  } {
    const sourceBucket =
      this.configService.get<string>('S3_REPLICATION_SOURCE_BUCKET') ||
      'atlas-audit-logs';
    const destinationBucket =
      this.configService.get<string>('S3_REPLICATION_DEST_BUCKET') ||
      'atlas-audit-logs-replica';
    const schedule =
      this.configService.get<string>('S3_REPLICATION_SCHEDULE') ||
      '0 */6 * * *';
    const enabled =
      this.configService.get<string>('S3_REPLICATION_ENABLED') === 'true';

    return {
      sourceBucket,
      destinationBucket,
      schedule,
      enabled,
    };
  }

  private loadPolicies(): void {
    const rawPolicies = this.configService.get<string>('OBJECT_LOCK_POLICIES');
    if (rawPolicies) {
      try {
        this.policies = JSON.parse(rawPolicies);
        return;
      } catch {
        // Fall back to defaults on parse error
      }
    }

    this.policies = [
      {
        bucket: 'atlas-audit-logs',
        mode: 'COMPLIANCE',
        retentionDays: 365,
        enabled: true,
      },
      {
        bucket: 'atlas-email-archives',
        mode: 'GOVERNANCE',
        retentionDays: 180,
        enabled: true,
      },
      {
        bucket: 'atlas-backups',
        mode: 'GOVERNANCE',
        retentionDays: 90,
        enabled: false,
      },
    ];
  }
}
