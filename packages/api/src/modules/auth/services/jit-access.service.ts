import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

export interface JitAccessToken {
  token: string;
  userId: string;
  environment: string;
  expiresAt: Date;
  grantedAt: Date;
}

/**
 * FR-129.A4: Environment-gated JIT pre-prod access service.
 *
 * Only active when NODE_ENV !== 'production'.
 * Grants temporary access tokens for pre-prod environments.
 */
@Injectable()
export class JitAccessService {
  private readonly logger = new Logger(JitAccessService.name);
  private readonly tokens = new Map<string, JitAccessToken>();
  private readonly isEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    const nodeEnv = this.configService.get<string>('NODE_ENV') || 'development';
    this.isEnabled = nodeEnv !== 'production';
    if (this.isEnabled) {
      this.logger.log('JIT pre-prod access service is ENABLED');
    } else {
      this.logger.warn('JIT pre-prod access service is DISABLED (production mode)');
    }
  }

  /**
   * Check if the service is currently active.
   */
  isActive(): boolean {
    return this.isEnabled;
  }

  /**
   * Grant a temporary access token for a pre-prod environment.
   */
  grantAccess(
    userId: string,
    environment: string,
    durationMinutes: number = 60,
  ): JitAccessToken | null {
    if (!this.isEnabled) {
      this.logger.warn(
        `JIT access denied: service disabled in production (userId=${userId})`,
      );
      return null;
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationMinutes * 60 * 1000);
    const token = crypto.randomUUID();

    const accessToken: JitAccessToken = {
      token,
      userId,
      environment,
      expiresAt,
      grantedAt: now,
    };

    this.tokens.set(token, accessToken);
    this.logger.log(
      `JIT access granted: user=${userId}, env=${environment}, expires=${expiresAt.toISOString()}`,
    );

    return accessToken;
  }

  /**
   * Validate a JIT access token. Returns the token record if valid, null otherwise.
   */
  validateToken(token: string): JitAccessToken | null {
    if (!this.isEnabled) return null;

    const record = this.tokens.get(token);
    if (!record) return null;

    if (record.expiresAt <= new Date()) {
      this.tokens.delete(token);
      return null;
    }

    return record;
  }

  /**
   * Revoke a JIT access token.
   */
  revokeToken(token: string): boolean {
    return this.tokens.delete(token);
  }

  /**
   * Revoke all tokens for a specific user.
   */
  revokeAllForUser(userId: string): number {
    let revoked = 0;
    for (const [token, record] of this.tokens.entries()) {
      if (record.userId === userId) {
        this.tokens.delete(token);
        revoked++;
      }
    }
    return revoked;
  }

  /**
   * Prune all expired tokens. Returns the number pruned.
   */
  pruneExpired(): number {
    const now = new Date();
    let pruned = 0;
    for (const [token, record] of this.tokens.entries()) {
      if (record.expiresAt <= now) {
        this.tokens.delete(token);
        pruned++;
      }
    }
    return pruned;
  }
}
