import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { TokenResponseDto } from './dto/token-response.dto';

/**
 * User roles matching BRD Section 3.
 * Defined locally to avoid path-mapping issues with @atlas/shared.
 */
export enum UserRole {
  BUSINESS_TEAM_USER = 'BUSINESS_TEAM_USER',
  COLLATERAL_OFFICER = 'COLLATERAL_OFFICER',
  COLLATERAL_LEAD = 'COLLATERAL_LEAD',
  COLLATERAL_HEAD = 'COLLATERAL_HEAD',
  FPR = 'FPR',
  FPR_SUPERVISOR = 'FPR_SUPERVISOR',
  VENDOR = 'VENDOR',
  MASTER_DATA_ADMIN = 'MASTER_DATA_ADMIN',
  MASTER_DATA_APPROVER = 'MASTER_DATA_APPROVER',
  SYS_ADMIN = 'SYS_ADMIN',
  COMPLIANCE_OFFICER = 'COMPLIANCE_OFFICER',
  MLOPS = 'MLOPS',
  API_SERVICE_ACCOUNT = 'API_SERVICE_ACCOUNT',
}

export interface JwtPayload {
  sub: string;
  email: string;
  roles: UserRole[];
  region?: string;
}

/**
 * Dev-mode seed users for local development.
 * In production this would validate against a user store / AD.
 */
interface DevUser {
  id: string;
  email: string;
  password: string;
  roles: UserRole[];
  region?: string;
}

const DEV_USERS: DevUser[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    email: 'admin@atlas.dev',
    password: 'password123',
    roles: [UserRole.SYS_ADMIN],
    region: 'GLOBAL',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'officer@atlas.dev',
    password: 'password123',
    roles: [UserRole.COLLATERAL_OFFICER],
    region: 'NORTH',
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    email: 'lead@atlas.dev',
    password: 'password123',
    roles: [UserRole.COLLATERAL_LEAD],
    region: 'SOUTH',
  },
  {
    id: '00000000-0000-0000-0000-000000000004',
    email: 'fpr@atlas.dev',
    password: 'password123',
    roles: [UserRole.FPR],
    region: 'WEST',
  },
  {
    id: '00000000-0000-0000-0000-000000000005',
    email: 'vendor@atlas.dev',
    password: 'password123',
    roles: [UserRole.VENDOR],
  },
];

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessTokenExpirySeconds = 3600; // 60 minutes
  private readonly refreshTokenExpirySeconds = 28800; // 8 hours

  // Token revocation blocklist: stores JTI → expiry timestamp
  private readonly revokedTokens: Map<string, number> = new Map();

  // FR-080.A1: OTP store — maps email to { otp, otpId, expiresAt }
  private readonly otpStore: Map<
    string,
    { otp: string; otpId: string; expiresAt: Date }
  > = new Map();

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    // Sweep expired entries every 10 minutes
    setInterval(() => this.sweepRevokedTokens(), 10 * 60 * 1000).unref();
  }

  async validateCredentials(
    email: string,
    password: string,
  ): Promise<DevUser | null> {
    // Dev mode only: check against seed users
    const authMode = this.configService.get('AUTH_MODE', 'dev');
    if (authMode === 'oidc') {
      throw new UnauthorizedException('Dev auth is disabled when AUTH_MODE=oidc');
    }
    const user = DEV_USERS.find(
      (u) => u.email === email && u.password === password,
    );
    return user || null;
  }

  async login(email: string, password: string): Promise<TokenResponseDto> {
    const user = await this.validateCredentials(email, password);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    this.logger.log(`User logged in: ${user.email}`);
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string): Promise<TokenResponseDto> {
    try {
      const payload = this.jwtService.verify<JwtPayload & { type: string; jti?: string }>(
        refreshToken,
        {
          secret: this.getJwtSecret(),
        },
      );

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      // Check if the token has been revoked
      if (payload.jti && this.revokedTokens.has(payload.jti)) {
        throw new UnauthorizedException('Token has been revoked');
      }

      // Find the user to re-issue tokens
      const user = DEV_USERS.find((u) => u.id === payload.sub);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Revoke the old refresh token (one-time use)
      if (payload.jti) {
        this.revokeToken(payload.jti, this.refreshTokenExpirySeconds);
      }

      this.logger.log(`Token refreshed for: ${user.email}`);
      return this.issueTokens(user);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /**
   * Revoke a token by its JTI.
   */
  revokeToken(jti: string, ttlSeconds?: number): void {
    const expiry = Date.now() + (ttlSeconds || this.refreshTokenExpirySeconds) * 1000;
    this.revokedTokens.set(jti, expiry);
  }

  /**
   * Check if a token JTI has been revoked.
   */
  isTokenRevoked(jti: string): boolean {
    return this.revokedTokens.has(jti);
  }

  private issueTokens(user: DevUser): TokenResponseDto {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      region: user.region,
    };

    const accessToken = this.jwtService.sign(
      { ...payload, type: 'access', jti: crypto.randomUUID() },
      { expiresIn: this.accessTokenExpirySeconds },
    );

    const refreshToken = this.jwtService.sign(
      { ...payload, type: 'refresh', jti: crypto.randomUUID() },
      { expiresIn: this.refreshTokenExpirySeconds },
    );

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: this.accessTokenExpirySeconds,
      token_type: 'Bearer',
    };
  }

  private getJwtSecret(): string {
    const secret = this.configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET environment variable is required');
    }
    return secret;
  }

  /**
   * FR-080.A1: Generate a 6-digit OTP for vendor login.
   * Stores the OTP in-memory with a 5-minute expiry.
   */
  generateOtp(email: string): { otpId: string; expiresAt: Date } {
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    this.otpStore.set(email, { otp, otpId, expiresAt });
    this.logger.log(`OTP generated for ${email}, otpId=${otpId}`);

    return { otpId, expiresAt };
  }

  /**
   * FR-080.A1: Verify a 6-digit OTP and return a JWT if valid.
   */
  verifyOtp(
    email: string,
    otp: string,
  ): { valid: boolean; token?: string } {
    const entry = this.otpStore.get(email);
    if (!entry) {
      return { valid: false };
    }

    if (new Date() > entry.expiresAt) {
      this.otpStore.delete(email);
      return { valid: false };
    }

    if (entry.otp !== otp) {
      return { valid: false };
    }

    // OTP is valid — consume it
    this.otpStore.delete(email);

    // Find the user to issue a token
    const user = DEV_USERS.find((u) => u.email === email);
    if (!user) {
      return { valid: false };
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      region: user.region,
    };

    const token = this.jwtService.sign(
      { ...payload, type: 'access', jti: crypto.randomUUID() },
      { expiresIn: this.accessTokenExpirySeconds },
    );

    this.logger.log(`OTP verified for ${email}, token issued`);
    return { valid: true, token };
  }

  /**
   * FR-140.A2: OAuth 2.0 Client Credentials Grant.
   *
   * Validates client credentials against configured clients (OAUTH_CLIENTS env var)
   * and issues a scoped access token.
   */
  async clientCredentialsGrant(
    clientId: string,
    clientSecret: string,
    scopes: string[],
  ): Promise<{
    access_token: string;
    expires_in: number;
    scope: string;
    token_type: string;
  }> {
    const validClients = JSON.parse(
      this.configService.get<string>('OAUTH_CLIENTS') || '{}',
    );
    const client = validClients[clientId];
    if (!client || client.secret !== clientSecret) {
      throw new UnauthorizedException('Invalid client credentials');
    }

    // Filter requested scopes against allowed scopes
    const allowedScopes: string[] = client.scopes || [];
    const grantedScopes = scopes.filter((s) => allowedScopes.includes(s));
    if (grantedScopes.length === 0) {
      throw new UnauthorizedException('No valid scopes');
    }

    const payload = {
      sub: clientId,
      type: 'client_credentials',
      scopes: grantedScopes,
    };
    const token = this.jwtService.sign(payload, { expiresIn: '1h' });

    this.logger.log(
      `Client credentials grant issued for ${clientId}, scopes: ${grantedScopes.join(' ')}`,
    );

    return {
      access_token: token,
      expires_in: 3600,
      scope: grantedScopes.join(' '),
      token_type: 'Bearer',
    };
  }

  private sweepRevokedTokens(): void {
    const now = Date.now();
    for (const [jti, expiry] of this.revokedTokens.entries()) {
      if (expiry <= now) {
        this.revokedTokens.delete(jti);
      }
    }
  }
}
