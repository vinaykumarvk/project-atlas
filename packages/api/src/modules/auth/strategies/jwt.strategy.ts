import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptionsWithoutRequest } from 'passport-jwt';
import { JwtPayload, UserRole } from '../auth.service';
import { AuthModeConfig } from '../config/auth-mode.config';
import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';

export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: UserRole[];
  region?: string;
  amr?: string[];
}

/**
 * Fetches the JWKS from an OIDC provider and caches it.
 * Used in oidc mode to verify token signatures.
 */
class JwksClient {
  private readonly logger = new Logger(JwksClient.name);
  private jwksCache: Record<string, crypto.KeyObject> = {};
  private lastFetch = 0;
  private readonly cacheTtlMs = 600_000; // 10 minutes

  constructor(private readonly jwksUri: string) {}

  async getSigningKey(kid: string): Promise<string> {
    const now = Date.now();
    if (now - this.lastFetch > this.cacheTtlMs || !this.jwksCache[kid]) {
      await this.fetchKeys();
    }
    const key = this.jwksCache[kid];
    if (!key) {
      throw new UnauthorizedException(`Signing key not found for kid: ${kid}`);
    }
    return key.export({ type: 'spki', format: 'pem' }).toString();
  }

  private fetchKeys(): Promise<void> {
    return new Promise((resolve, reject) => {
      const getter = this.jwksUri.startsWith('https') ? https.get : http.get;
      getter(this.jwksUri, (res) => {
        let data = '';
        res.on('data', (chunk: string) => (data += chunk));
        res.on('end', () => {
          try {
            const jwks = JSON.parse(data);
            this.jwksCache = {};
            for (const key of jwks.keys) {
              if (key.use === 'sig' && key.kty === 'RSA') {
                const keyObject = crypto.createPublicKey({ key, format: 'jwk' });
                this.jwksCache[key.kid] = keyObject;
              }
            }
            this.lastFetch = Date.now();
            this.logger.debug(`Fetched ${Object.keys(this.jwksCache).length} signing keys`);
            resolve();
          } catch (err) {
            reject(err);
          }
        });
        res.on('error', reject);
      }).on('error', reject);
    });
  }
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);
  private readonly jwksClient?: JwksClient;

  constructor(private readonly authModeConfig: AuthModeConfig) {
    const opts: StrategyOptionsWithoutRequest = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // For dev mode use the local secret; for oidc, we use secretOrKeyProvider
      ...(authModeConfig.isDev
        ? { secretOrKey: authModeConfig.jwtSecret }
        : {
            secretOrKeyProvider: (
              _request: unknown,
              rawJwtToken: string,
              done: (err: Error | null, key?: string) => void,
            ) => {
              try {
                // Decode header to get kid
                const headerB64 = rawJwtToken.split('.')[0];
                const header = JSON.parse(
                  Buffer.from(headerB64, 'base64url').toString('utf8'),
                );
                const kid = header.kid;
                if (!kid) {
                  return done(new UnauthorizedException('JWT header missing kid'));
                }
                // This is set in the constructor body below
                void (this as JwtStrategy).resolveSigningKey(kid, done);
              } catch (err) {
                done(err instanceof Error ? err : new Error(String(err)));
              }
            },
            // OIDC tokens specify their audience and issuer
            audience: authModeConfig.oidcClientId,
            issuer: authModeConfig.oidcIssuerUrl,
          }),
    };

    super(opts);

    if (authModeConfig.isOidc && authModeConfig.oidcIssuerUrl) {
      const jwksUri = `${authModeConfig.oidcIssuerUrl.replace(/\/$/, '')}/.well-known/jwks.json`;
      this.jwksClient = new JwksClient(jwksUri);
      this.logger.log(`OIDC JWKS endpoint: ${jwksUri}`);
    }
  }

  /** Resolve signing key for OIDC mode */
  private async resolveSigningKey(
    kid: string,
    done: (err: Error | null, key?: string) => void,
  ): Promise<void> {
    try {
      if (!this.jwksClient) {
        return done(new Error('JWKS client not initialised'));
      }
      const key = await this.jwksClient.getSigningKey(kid);
      done(null, key);
    } catch (err) {
      done(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /**
   * Called by Passport after verifying the token signature and expiry.
   * The returned object is attached to `request.user`.
   */
  async validate(
    payload: JwtPayload & { type?: string; realm_access?: { roles: string[] }; amr?: string[] },
  ): Promise<AuthenticatedUser> {
    // In dev mode, only accept access tokens (not refresh tokens)
    if (this.authModeConfig.isDev && payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Extract roles: support OIDC realm_access.roles (Keycloak) or direct roles claim
    let roles: UserRole[] = payload.roles ?? [];
    if (
      this.authModeConfig.isOidc &&
      (!roles || roles.length === 0) &&
      payload.realm_access?.roles
    ) {
      roles = payload.realm_access.roles
        .filter((r): r is UserRole =>
          Object.values(UserRole).includes(r as UserRole),
        );
    }

    return {
      id: payload.sub,
      email: payload.email,
      roles,
      region: payload.region,
      amr: payload.amr,
    };
  }
}
