import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Maps each source region to its cross-region replication target.
 * Actual replication is handled at the infrastructure level (S3 CRR);
 * this constant makes the mapping available to application code for
 * validation, monitoring dashboards, and disaster-recovery tooling.
 */
export const REPLICATION_TARGETS: Record<string, string> = {
  'us-east-1': 'us-west-2',
  'eu-west-1': 'eu-central-1',
  'ap-south-1': 'ap-southeast-1',
};

export interface BackupConfig {
  region: string;
  s3Bucket: string;
  s3Prefix: string;
  retentionDays: number;
  encryptionKeyId?: string;
  schedule: string; // cron expression for full backups
  incrementalSchedule: string; // cron expression for hourly incremental backups
}

@Injectable()
export class BackupConfigService {
  private readonly configs: Map<string, BackupConfig> = new Map();

  constructor(private readonly configService: ConfigService) {
    const rawConfigs = this.configService.get<string>('BACKUP_CONFIGS');
    if (rawConfigs) {
      try {
        const parsed: BackupConfig[] = JSON.parse(rawConfigs);
        for (const cfg of parsed) {
          this.configs.set(cfg.region, cfg);
        }
      } catch {
        // Fall back to defaults on parse error
        this.loadDefaults();
      }
    } else {
      this.loadDefaults();
    }
  }

  getConfigForRegion(region: string): BackupConfig | undefined {
    return this.configs.get(region);
  }

  getAllConfigs(): BackupConfig[] {
    return Array.from(this.configs.values());
  }

  getDestination(region: string): { bucket: string; prefix: string } | undefined {
    const config = this.configs.get(region);
    if (!config) {
      return undefined;
    }
    return { bucket: config.s3Bucket, prefix: config.s3Prefix };
  }

  /**
   * Returns the cross-region replication configuration for the given source
   * region.  If no explicit region is supplied the first configured region
   * is used.  The `enabled` flag is true when a replication target exists
   * for the resolved source region.
   */
  getReplicationConfig(
    sourceRegion?: string,
  ): { sourceRegion: string; targetRegion: string; enabled: boolean } {
    const resolved =
      sourceRegion ?? (this.configs.keys().next().value as string) ?? 'us-east-1';
    const target = REPLICATION_TARGETS[resolved];
    return {
      sourceRegion: resolved,
      targetRegion: target ?? '',
      enabled: !!target,
    };
  }

  /**
   * FR-154.A1: Get the full and incremental backup schedule for a region.
   */
  getSchedule(region: string): { fullBackup: string; incremental: string } | undefined {
    const config = this.configs.get(region);
    if (!config) {
      return undefined;
    }
    return {
      fullBackup: config.schedule,
      incremental: config.incrementalSchedule,
    };
  }

  /**
   * FR-154.A1: Check if a backup is due for a region right now.
   * Performs a simple hour-based check against the cron schedule.
   * The cron format assumed is: "minute hour * * *" for daily schedules.
   */
  isBackupDue(region: string): boolean {
    const config = this.configs.get(region);
    if (!config) {
      return false;
    }

    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();

    // Check full backup schedule (e.g. "0 2 * * *")
    const fullParts = config.schedule.split(/\s+/);
    if (fullParts.length >= 2) {
      const cronMinute = parseInt(fullParts[0], 10);
      const cronHour = parseInt(fullParts[1], 10);
      if (currentHour === cronHour && currentMinute === cronMinute) {
        return true;
      }
    }

    // Check incremental backup schedule (e.g. "0 * * * *")
    const incrParts = config.incrementalSchedule.split(/\s+/);
    if (incrParts.length >= 1) {
      const cronMinute = parseInt(incrParts[0], 10);
      if (!isNaN(cronMinute) && currentMinute === cronMinute) {
        return true;
      }
    }

    return false;
  }

  private loadDefaults(): void {
    const defaults: BackupConfig[] = [
      {
        region: 'us-east-1',
        s3Bucket: 'atlas-backups-us-east-1',
        s3Prefix: 'daily/',
        retentionDays: 30,
        schedule: '0 2 * * *', // Daily at 2 AM
        incrementalSchedule: '0 * * * *', // Hourly incremental backup
      },
      {
        region: 'eu-west-1',
        s3Bucket: 'atlas-backups-eu-west-1',
        s3Prefix: 'daily/',
        retentionDays: 90,
        schedule: '0 3 * * *', // Daily at 3 AM
        incrementalSchedule: '0 * * * *', // Hourly incremental backup
      },
      {
        region: 'ap-south-1',
        s3Bucket: 'atlas-backups-ap-south-1',
        s3Prefix: 'daily/',
        retentionDays: 60,
        schedule: '0 4 * * *', // Daily at 4 AM
        incrementalSchedule: '0 * * * *', // Hourly incremental backup
      },
    ];

    for (const cfg of defaults) {
      this.configs.set(cfg.region, cfg);
    }
  }
}
