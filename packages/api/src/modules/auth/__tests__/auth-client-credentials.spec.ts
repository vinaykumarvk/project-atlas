import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { AuthService } from '../auth.service';

const TEST_JWT_SECRET = 'test-client-credentials-secret';

const OAUTH_CLIENTS = JSON.stringify({
  'client-app-1': {
    secret: 'secret-abc-123',
    scopes: ['read:cases', 'write:cases', 'read:emails'],
  },
  'client-app-2': {
    secret: 'secret-xyz-789',
    scopes: ['read:cases'],
  },
});

describe('AuthService — clientCredentialsGrant (FR-140.A2)', () => {
  let service: AuthService;
  let jwtService: JwtService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              JWT_SECRET: TEST_JWT_SECRET,
              OAUTH_CLIENTS,
            }),
          ],
        }),
        JwtModule.register({
          secret: TEST_JWT_SECRET,
          signOptions: { expiresIn: '60m' },
        }),
      ],
      providers: [AuthService],
    }).compile();

    service = module.get(AuthService);
    jwtService = module.get(JwtService);
  });

  it('should issue a token for valid client credentials', async () => {
    const result = await service.clientCredentialsGrant(
      'client-app-1',
      'secret-abc-123',
      ['read:cases', 'write:cases'],
    );

    expect(result.access_token).toBeDefined();
    expect(result.expires_in).toBe(3600);
    expect(result.token_type).toBe('Bearer');
    expect(result.scope).toBe('read:cases write:cases');
  });

  it('should filter scopes to only allowed ones', async () => {
    const result = await service.clientCredentialsGrant(
      'client-app-1',
      'secret-abc-123',
      ['read:cases', 'admin:all'],
    );

    expect(result.scope).toBe('read:cases');
  });

  it('should include correct claims in the JWT', async () => {
    const result = await service.clientCredentialsGrant(
      'client-app-1',
      'secret-abc-123',
      ['read:cases'],
    );

    const decoded = jwtService.verify(result.access_token);
    expect(decoded.sub).toBe('client-app-1');
    expect(decoded.type).toBe('client_credentials');
    expect(decoded.scopes).toEqual(['read:cases']);
  });

  it('should throw UnauthorizedException for invalid client ID', async () => {
    await expect(
      service.clientCredentialsGrant('unknown-client', 'any-secret', ['read:cases']),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException for invalid client secret', async () => {
    await expect(
      service.clientCredentialsGrant('client-app-1', 'wrong-secret', ['read:cases']),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when no requested scopes are allowed', async () => {
    await expect(
      service.clientCredentialsGrant('client-app-2', 'secret-xyz-789', ['admin:all']),
    ).rejects.toThrow(UnauthorizedException);
    await expect(
      service.clientCredentialsGrant('client-app-2', 'secret-xyz-789', ['admin:all']),
    ).rejects.toThrow('No valid scopes');
  });

  it('should throw UnauthorizedException when OAUTH_CLIENTS is empty', async () => {
    // Create a service with no OAUTH_CLIENTS configured
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [() => ({ JWT_SECRET: TEST_JWT_SECRET })],
        }),
        JwtModule.register({
          secret: TEST_JWT_SECRET,
          signOptions: { expiresIn: '60m' },
        }),
      ],
      providers: [AuthService],
    }).compile();

    const svc = module.get(AuthService);
    await expect(
      svc.clientCredentialsGrant('any', 'any', ['read:cases']),
    ).rejects.toThrow(UnauthorizedException);
  });
});
