import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { AuditLogService } from '../../modules/audit/services/audit-log.service';

/**
 * FR-122.A1: KMS Provider interface for envelope encryption.
 * Implementations could wrap AWS KMS, Azure Key Vault, GCP KMS, etc.
 */
export interface KmsProvider {
  generateDataKey(): Promise<{ plaintext: Buffer; encrypted: Buffer }>;
  decrypt(encryptedKey: Buffer): Promise<Buffer>;
}

/**
 * AES-256-GCM encryption service for data at rest (FR-122).
 * Used for encrypting RFC822 email archives and sensitive fields.
 */
@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32; // 256 bits
  private readonly ivLength = 12; // 96 bits for GCM
  private readonly tagLength = 16; // 128-bit auth tag

  private readonly logger = new Logger(EncryptionService.name);
  private encryptionKey: Buffer;
  private lastRotatedAt: Date | null = null;
  private auditEvents: Array<{ event_code: string; timestamp: string; details: any }> = [];

  constructor(
    private config: ConfigService,
    @Optional() private readonly auditLogService?: AuditLogService,
  ) {
    const keyHex = this.config.get<string>('ENCRYPTION_KEY');
    if (!keyHex) {
      throw new Error('ENCRYPTION_KEY environment variable is required (64 hex characters)');
    }
    this.encryptionKey = Buffer.from(keyHex, 'hex');

    if (this.encryptionKey.length !== this.keyLength) {
      throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
    }
  }

  /**
   * Encrypt data using AES-256-GCM.
   * Returns: IV (12 bytes) + Auth Tag (16 bytes) + Ciphertext
   */
  encrypt(plaintext: Buffer): Buffer {
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, this.encryptionKey, iv);

    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Concatenate: IV + Tag + Ciphertext
    return Buffer.concat([iv, tag, encrypted]);
  }

  /**
   * Decrypt data encrypted with AES-256-GCM.
   * Input format: IV (12 bytes) + Auth Tag (16 bytes) + Ciphertext
   */
  decrypt(ciphertext: Buffer): Buffer {
    const iv = ciphertext.subarray(0, this.ivLength);
    const tag = ciphertext.subarray(this.ivLength, this.ivLength + this.tagLength);
    const encrypted = ciphertext.subarray(this.ivLength + this.tagLength);

    const decipher = crypto.createDecipheriv(this.algorithm, this.encryptionKey, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  /**
   * Compute SHA-256 checksum of data.
   */
  checksum(data: Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * FR-122.A1: Envelope encryption using a KMS provider.
   *
   * Generates a data encryption key (DEK) via the KMS provider,
   * encrypts the data with the DEK, and returns both the encrypted
   * data and the KMS-wrapped DEK.
   */
  async envelopeEncrypt(
    data: string,
    kmsProvider: KmsProvider,
  ): Promise<{ encryptedData: string; encryptedKey: string }> {
    const { plaintext, encrypted: encryptedKeyBuf } =
      await kmsProvider.generateDataKey();

    // Use the plaintext DEK to encrypt the data
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, plaintext, iv);
    const encryptedBuf = Buffer.concat([
      cipher.update(Buffer.from(data, 'utf-8')),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();

    // Package: IV + Tag + Ciphertext, all base64-encoded
    const encryptedData = Buffer.concat([iv, tag, encryptedBuf]).toString('base64');
    const encryptedKey = encryptedKeyBuf.toString('base64');

    return { encryptedData, encryptedKey };
  }

  /**
   * FR-122.A1: Envelope decryption using a KMS provider.
   *
   * Decrypts the KMS-wrapped DEK, then uses it to decrypt the data.
   */
  async envelopeDecrypt(
    encryptedData: string,
    encryptedKey: string,
    kmsProvider: KmsProvider,
  ): Promise<string> {
    const encryptedKeyBuf = Buffer.from(encryptedKey, 'base64');
    const dek = await kmsProvider.decrypt(encryptedKeyBuf);

    const combined = Buffer.from(encryptedData, 'base64');
    const iv = combined.subarray(0, this.ivLength);
    const tag = combined.subarray(this.ivLength, this.ivLength + this.tagLength);
    const ciphertext = combined.subarray(this.ivLength + this.tagLength);

    const decipher = crypto.createDecipheriv(this.algorithm, dek, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString('utf-8');
  }

  /**
   * FR-122.A3: Rotate the encryption key.
   *
   * Replaces the current encryption key with a new one.
   * Returns prefixes of the old and new keys for audit purposes.
   * Emits an audit log event.
   */
  rotateKey(newKeyHex: string): {
    previousKeyPrefix: string;
    newKeyPrefix: string;
  } {
    const newKey = Buffer.from(newKeyHex, 'hex');
    if (newKey.length !== this.keyLength) {
      throw new Error('New key must be 32 bytes (64 hex characters)');
    }

    const previousKeyPrefix = this.encryptionKey
      .subarray(0, 4)
      .toString('hex');
    const newKeyPrefix = newKey.subarray(0, 4).toString('hex');

    this.encryptionKey = newKey;

    this.logger.log(
      `Encryption key rotated: previous=${previousKeyPrefix}..., new=${newKeyPrefix}...`,
    );

    // FR-122.A3: Emit audit log event for key rotation
    if (this.auditLogService) {
      this.auditLogService.emit({
        event_code: 'KEY_ROTATED',
        actor_type: 'SYSTEM',
        resource_type: 'ENCRYPTION_KEY',
        action: 'ROTATE',
        payload_json: {
          previousKeyPrefix,
          newKeyPrefix,
        },
      }).catch((err) => {
        this.logger.error(`Failed to emit audit event for key rotation: ${err.message}`);
      });
    }

    return { previousKeyPrefix, newKeyPrefix };
  }

  /**
   * FR-122.A3: Quarterly key rotation check — runs at 01:00 on the 1st of every 3rd month.
   */
  @Cron('0 1 1 */3 *')
  async handleQuarterlyKeyRotationCheck(): Promise<void> {
    this.logger.log('Quarterly key rotation check triggered');
    const daysSinceRotation = this.getDaysSinceLastRotation();
    if (daysSinceRotation >= 90) {
      this.logger.warn(`Key rotation overdue — ${daysSinceRotation} days since last rotation`);
      // Emit KEY_ROTATION_DUE audit event
      this.auditEvents.push({
        event_code: 'KEY_ROTATION_DUE',
        timestamp: new Date().toISOString(),
        details: { daysSinceRotation },
      });
    }
  }

  private getDaysSinceLastRotation(): number {
    if (!this.lastRotatedAt) return 999;
    return Math.floor((Date.now() - this.lastRotatedAt.getTime()) / (24 * 60 * 60 * 1000));
  }
}
