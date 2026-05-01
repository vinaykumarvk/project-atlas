import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
