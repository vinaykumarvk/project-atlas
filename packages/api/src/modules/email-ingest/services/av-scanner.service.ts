import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../common/prisma';
import { ObjectStorageService } from '../../../common/services/object-storage.service';
import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import * as crypto from 'crypto';

const execAsync = promisify(exec);

/**
 * Result of an antivirus scan.
 */
export interface AvScanResult {
  clean: boolean;
  verdict: string;
}

/**
 * Interface for antivirus scanner implementations.
 */
export interface AvScannerProvider {
  scan(buffer: Buffer): Promise<AvScanResult>;
}

/**
 * ClamAV-based antivirus scanner.
 * Uses the clamscan command-line tool to scan files.
 */
export class LocalAvScanner implements AvScannerProvider {
  private readonly logger = new Logger(LocalAvScanner.name);
  private readonly clamScanPath: string;

  constructor(clamScanPath = 'clamscan') {
    this.clamScanPath = clamScanPath;
  }

  async scan(buffer: Buffer): Promise<AvScanResult> {
    // Write buffer to a temp file for scanning
    const tempId = crypto.randomBytes(8).toString('hex');
    const tempPath = join(tmpdir(), `atlas-av-scan-${tempId}`);

    try {
      await writeFile(tempPath, buffer);

      const { stdout, stderr } = await execAsync(
        `${this.clamScanPath} --no-summary "${tempPath}"`,
        { timeout: 60_000 },
      ).catch((error) => {
        // clamscan returns exit code 1 when a virus is found
        if (error.code === 1) {
          return { stdout: error.stdout || '', stderr: error.stderr || '' };
        }
        throw error;
      });

      const output = stdout + stderr;

      // Parse ClamAV output
      if (output.includes('FOUND')) {
        const virusMatch = output.match(/:\s*(.+)\s+FOUND/);
        const virusName = virusMatch ? virusMatch[1].trim() : 'Unknown threat';
        this.logger.warn(`AV scan detected threat: ${virusName}`);
        return { clean: false, verdict: virusName };
      }

      if (output.includes('OK')) {
        return { clean: true, verdict: 'CLEAN' };
      }

      // If we can't parse the output, treat as error
      this.logger.warn(`Unexpected clamscan output: ${output.substring(0, 200)}`);
      return { clean: true, verdict: 'SCAN_INCONCLUSIVE' };
    } finally {
      // Clean up temp file
      try {
        await unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

/**
 * No-op antivirus scanner for development/testing.
 * Always returns clean result.
 */
export class NoOpAvScanner implements AvScannerProvider {
  async scan(_buffer: Buffer): Promise<AvScanResult> {
    return { clean: true, verdict: 'NOOP_CLEAN' };
  }
}

/**
 * Antivirus Scanner Service.
 *
 * Scans file attachments for malware and records the scan result
 * on the CaseAttachment record. Uses a pluggable scanner provider:
 * - LocalAvScanner (ClamAV) for production
 * - NoOpAvScanner for development
 *
 * Quarantined attachments (av_scan_status = 'INFECTED') are blocked
 * from download.
 */
@Injectable()
export class AvScannerService {
  private readonly logger = new Logger(AvScannerService.name);
  private readonly scanner: AvScannerProvider;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly objectStorage: ObjectStorageService,
  ) {
    const scannerMode = this.config.get<string>('AV_SCANNER_MODE', 'noop');
    const clamScanPath = this.config.get<string>('CLAMSCAN_PATH', 'clamscan');

    if (scannerMode === 'clamav') {
      this.scanner = new LocalAvScanner(clamScanPath);
      this.logger.log('AV scanner initialized: ClamAV (local)');
    } else {
      this.scanner = new NoOpAvScanner();
      this.logger.log('AV scanner initialized: NoOp (development mode)');
    }
  }

  /**
   * Scan a buffer for malware.
   */
  async scan(buffer: Buffer): Promise<AvScanResult> {
    return this.scanner.scan(buffer);
  }

  /**
   * Scan an attachment and update its CaseAttachment record with the result.
   *
   * @param attachmentId - The CaseAttachment record ID
   * @param buffer - The file content to scan
   * @returns The scan result
   */
  async scanAttachment(attachmentId: string, buffer: Buffer): Promise<AvScanResult> {
    this.logger.debug(`Scanning attachment ${attachmentId} (${buffer.length} bytes)`);

    try {
      const result = await this.scanner.scan(buffer);
      const status = result.clean ? 'CLEAN' : 'INFECTED';

      await this.prisma.caseAttachment.update({
        where: { id: attachmentId },
        data: {
          av_scan_status: status,
          av_scan_verdict: result.verdict,
          av_scanned_at: new Date(),
        },
      });

      if (!result.clean) {
        this.logger.warn(
          `Attachment ${attachmentId} quarantined: ${result.verdict}`,
        );
      } else {
        this.logger.debug(`Attachment ${attachmentId} scan result: ${result.verdict}`);
      }

      return result;
    } catch (error) {
      // Record scan error
      await this.prisma.caseAttachment.update({
        where: { id: attachmentId },
        data: {
          av_scan_status: 'ERROR',
          av_scan_verdict: `Scan error: ${(error as Error).message}`,
          av_scanned_at: new Date(),
        },
      });

      this.logger.error(`AV scan failed for attachment ${attachmentId}: ${(error as Error).message}`);
      return { clean: true, verdict: `SCAN_ERROR: ${(error as Error).message}` };
    }
  }

  /**
   * Check if an attachment is quarantined (blocked from download).
   */
  async isQuarantined(attachmentId: string): Promise<boolean> {
    const attachment = await this.prisma.caseAttachment.findUnique({
      where: { id: attachmentId },
      select: { av_scan_status: true },
    });

    return attachment?.av_scan_status === 'INFECTED';
  }

  /**
   * Scan all pending attachments for a case.
   * Fetches each attachment from object storage and runs an AV scan.
   * This is typically called after attachments are stored.
   */
  async scanPendingForCase(caseId: string): Promise<void> {
    const pending = await this.prisma.caseAttachment.findMany({
      where: {
        case_id: caseId,
        av_scan_status: 'PENDING',
        is_deleted: false,
      },
    });

    this.logger.log(`Scanning ${pending.length} pending attachment(s) for case ${caseId}`);

    for (const attachment of pending) {
      try {
        const buffer = await this.objectStorage.get(attachment.s3_key);
        if (!buffer) {
          this.logger.warn(
            `Attachment ${attachment.id} not found in object storage at ${attachment.s3_key}`,
          );
          continue;
        }
        await this.scanAttachment(attachment.id, buffer);
      } catch (error) {
        this.logger.error(
          `Failed to scan attachment ${attachment.id}: ${(error as Error).message}`,
        );
      }
    }
  }
}
