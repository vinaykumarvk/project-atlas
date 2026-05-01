import { Logger } from '@nestjs/common';

/**
 * PII fields map: model → fields requiring encryption at rest
 */
export const PII_FIELDS: Record<string, string[]> = {
  emailIngest: ['from_address', 'sender_name'],
  case: ['customer_email', 'customer_name', 'customer_phone'],
  internalNote: ['content'],
};

/**
 * Registers Prisma middleware for transparent PII encryption/decryption.
 * Uses AES-256-GCM via the provided EncryptionService.
 */
export function registerPiiEncryptionMiddleware(
  prisma: any,
  encryptionService: { encrypt(plaintext: string): string; decrypt(ciphertext: string): string } | null,
): void {
  const logger = new Logger('PiiEncryptionMiddleware');

  if (!encryptionService) {
    logger.warn('EncryptionService not available — PII encryption middleware disabled');
    return;
  }

  prisma.$use(async (params: any, next: any) => {
    const model = params.model;
    const piiFields = model ? PII_FIELDS[model] || PII_FIELDS[toCamelCase(model)] : null;

    if (!piiFields || piiFields.length === 0) {
      return next(params);
    }

    // Encrypt on create/update
    if (params.action === 'create' || params.action === 'update' || params.action === 'upsert') {
      const data = params.args.data;
      if (data) {
        for (const field of piiFields) {
          if (data[field] && typeof data[field] === 'string') {
            try {
              data[field] = encryptionService.encrypt(data[field]);
            } catch (err) {
              logger.error(`Failed to encrypt field=${field} model=${model}: ${err}`);
            }
          }
        }
      }
    }

    const result = await next(params);

    // Decrypt on read
    if (result && (params.action === 'findUnique' || params.action === 'findFirst' || params.action === 'findMany')) {
      const decryptRecord = (record: any) => {
        if (!record || typeof record !== 'object') return record;
        for (const field of piiFields) {
          if (record[field] && typeof record[field] === 'string') {
            try {
              record[field] = encryptionService.decrypt(record[field]);
            } catch {
              // Field may not be encrypted (legacy data) — leave as-is
            }
          }
        }
        return record;
      };

      if (Array.isArray(result)) {
        result.forEach(decryptRecord);
      } else {
        decryptRecord(result);
      }
    }

    return result;
  });

  logger.log('PII encryption middleware registered');
}

function toCamelCase(str: string): string {
  return str.charAt(0).toLowerCase() + str.slice(1);
}
