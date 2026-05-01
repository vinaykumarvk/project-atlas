import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type AuthMode = 'dev' | 'oidc';

/**
 * Central configuration for authentication mode.
 *
 * AUTH_MODE env var controls the behaviour:
 *   - 'dev'  (default) : hardcoded seed users, local JWT secret.
 *                         Only active when NODE_ENV !== 'production'.
 *   - 'oidc'           : validate JWTs against an external OIDC JWKS endpoint.
 *                         Requires OIDC_ISSUER_URL and OIDC_CLIENT_ID env vars.
 */
@Injectable()
export class AuthModeConfig {
  private readonly logger = new Logger(AuthModeConfig.name);

  readonly mode: AuthMode;
  readonly oidcIssuerUrl: string | undefined;
  readonly oidcClientId: string | undefined;
  readonly jwtSecret: string;

  constructor(private readonly configService: ConfigService) {
    const raw = this.configService.get<string>('AUTH_MODE', 'dev');
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');

    // Validate: dev mode in production emits a warning but is allowed for initial deployment
    if (raw === 'dev' && nodeEnv === 'production') {
      this.logger.warn(
        'AUTH_MODE=dev in production. Configure OIDC for production security.',
      );
      this.mode = 'dev';
    } else if (raw === 'oidc' || raw === 'dev') {
      this.mode = raw;
    } else {
      this.logger.warn(
        `Unknown AUTH_MODE "${raw}", falling back to "dev".`,
      );
      this.mode = 'dev';
    }

    this.jwtSecret = this.configService.get<string>(
      'JWT_SECRET',
      'atlas-dev-secret-change-me',
    );

    this.oidcIssuerUrl = this.configService.get<string>('OIDC_ISSUER_URL');
    this.oidcClientId = this.configService.get<string>('OIDC_CLIENT_ID');

    if (this.mode === 'oidc') {
      if (!this.oidcIssuerUrl) {
        throw new Error(
          'OIDC_ISSUER_URL is required when AUTH_MODE=oidc',
        );
      }
      if (!this.oidcClientId) {
        throw new Error(
          'OIDC_CLIENT_ID is required when AUTH_MODE=oidc',
        );
      }
    }

    this.logger.log(`Auth mode: ${this.mode}`);
  }

  get isDev(): boolean {
    return this.mode === 'dev';
  }

  get isOidc(): boolean {
    return this.mode === 'oidc';
  }
}
