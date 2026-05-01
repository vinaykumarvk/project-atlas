import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import * as crypto from 'crypto';
import { EncryptionService, KmsProvider } from '../services/encryption.service';
import { AuditLogService } from '../../modules/audit/services/audit-log.service';

const mockAuditLogService = {
  emit: jest.fn().mockResolvedValue({ id: 'mock-id' }),
};

// Generate a valid 32-byte key for testing
const TEST_KEY = crypto.randomBytes(32).toString('hex');
const NEW_KEY = crypto.randomBytes(32).toString('hex');

/**
 * Mock KMS provider that uses a local key for testing.
 */
class MockKmsProvider implements KmsProvider {
  private readonly masterKey = crypto.randomBytes(32);

  async generateDataKey(): Promise<{ plaintext: Buffer; encrypted: Buffer }> {
    const dek = crypto.randomBytes(32);
    // "Encrypt" the DEK by XORing with master key (simplified for testing)
    const encrypted = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) {
      encrypted[i] = dek[i] ^ this.masterKey[i];
    }
    return { plaintext: dek, encrypted };
  }

  async decrypt(encryptedKey: Buffer): Promise<Buffer> {
    const dek = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) {
      dek[i] = encryptedKey[i] ^ this.masterKey[i];
    }
    return dek;
  }
}

describe('EncryptionService — Envelope Encryption (FR-122.A1)', () => {
  let service: EncryptionService;
  let kmsProvider: MockKmsProvider;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ ENCRYPTION_KEY: TEST_KEY })],
        }),
      ],
      providers: [
        EncryptionService,
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get(EncryptionService);
    kmsProvider = new MockKmsProvider();
  });

  describe('envelopeEncrypt / envelopeDecrypt', () => {
    it('should encrypt and decrypt data using envelope encryption', async () => {
      const plaintext = 'Sensitive customer data: PAN=ABCDE1234F';

      const { encryptedData, encryptedKey } = await service.envelopeEncrypt(
        plaintext,
        kmsProvider,
      );

      // Encrypted data and key should be base64 strings
      expect(typeof encryptedData).toBe('string');
      expect(typeof encryptedKey).toBe('string');
      expect(encryptedData).not.toBe(plaintext);

      // Decrypt should return original plaintext
      const decrypted = await service.envelopeDecrypt(
        encryptedData,
        encryptedKey,
        kmsProvider,
      );
      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertexts for the same plaintext (unique IV)', async () => {
      const plaintext = 'Same data encrypted twice';

      const result1 = await service.envelopeEncrypt(plaintext, kmsProvider);
      const result2 = await service.envelopeEncrypt(plaintext, kmsProvider);

      // Different IVs and DEKs should produce different ciphertexts
      expect(result1.encryptedData).not.toBe(result2.encryptedData);
    });

    it('should handle empty string data', async () => {
      const { encryptedData, encryptedKey } = await service.envelopeEncrypt(
        '',
        kmsProvider,
      );

      const decrypted = await service.envelopeDecrypt(
        encryptedData,
        encryptedKey,
        kmsProvider,
      );
      expect(decrypted).toBe('');
    });

    it('should handle unicode data', async () => {
      const plaintext = 'Unicode test: \u0939\u093F\u0928\u094D\u0926\u0940 \u30C6\u30B9\u30C8';

      const { encryptedData, encryptedKey } = await service.envelopeEncrypt(
        plaintext,
        kmsProvider,
      );

      const decrypted = await service.envelopeDecrypt(
        encryptedData,
        encryptedKey,
        kmsProvider,
      );
      expect(decrypted).toBe(plaintext);
    });

    it('should fail decryption with a different KMS provider', async () => {
      const plaintext = 'Secret data';
      const { encryptedData, encryptedKey } = await service.envelopeEncrypt(
        plaintext,
        kmsProvider,
      );

      // A different KMS provider will have a different master key
      const differentKms = new MockKmsProvider();

      await expect(
        service.envelopeDecrypt(encryptedData, encryptedKey, differentKms),
      ).rejects.toThrow();
    });
  });
});

describe('EncryptionService — rotateKey (FR-122.A3)', () => {
  let service: EncryptionService;

  beforeEach(async () => {
    mockAuditLogService.emit.mockClear();
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ ENCRYPTION_KEY: TEST_KEY })],
        }),
      ],
      providers: [
        EncryptionService,
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get(EncryptionService);
  });

  it('should rotate the key and return prefixes', () => {
    const result = service.rotateKey(NEW_KEY);

    expect(result.previousKeyPrefix).toBe(
      Buffer.from(TEST_KEY, 'hex').subarray(0, 4).toString('hex'),
    );
    expect(result.newKeyPrefix).toBe(
      Buffer.from(NEW_KEY, 'hex').subarray(0, 4).toString('hex'),
    );
  });

  it('should use the new key for encryption after rotation', () => {
    const plaintext = Buffer.from('Test data for rotation');

    // Encrypt with old key
    const encrypted1 = service.encrypt(plaintext);

    // Rotate key
    service.rotateKey(NEW_KEY);

    // Encrypt with new key
    const encrypted2 = service.encrypt(plaintext);

    // Old ciphertext should NOT decrypt with the new key
    expect(() => service.decrypt(encrypted1)).toThrow();

    // New ciphertext should decrypt with the new key
    const decrypted = service.decrypt(encrypted2);
    expect(decrypted.toString()).toBe('Test data for rotation');
  });

  it('should throw for invalid key length', () => {
    expect(() => service.rotateKey('0011223344')).toThrow(
      'New key must be 32 bytes (64 hex characters)',
    );
  });

  it('should return different prefixes when key actually changes', () => {
    const result = service.rotateKey(NEW_KEY);
    expect(result.previousKeyPrefix).not.toBe(result.newKeyPrefix);
  });

  it('should emit an audit event with KEY_ROTATED on rotation', () => {
    service.rotateKey(NEW_KEY);
    expect(mockAuditLogService.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        event_code: 'KEY_ROTATED',
        resource_type: 'ENCRYPTION_KEY',
        action: 'ROTATE',
      }),
    );
  });
});
