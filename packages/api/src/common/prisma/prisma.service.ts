import { Injectable, OnModuleInit, OnModuleDestroy, Optional, Inject } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { registerPiiEncryptionMiddleware } from '../middleware/pii-encryption.middleware';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(
    @Optional() @Inject('EncryptionService') private readonly encryptionService?: { encrypt(plaintext: string): string; decrypt(ciphertext: string): string },
  ) {
    super();
  }

  async onModuleInit() {
    await this.$connect();
    registerPiiEncryptionMiddleware(this, this.encryptionService || null);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
