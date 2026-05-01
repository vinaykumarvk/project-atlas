import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { SamlStrategy, SamlProfile } from '../strategies/saml.strategy';

describe('SamlStrategy (FR-125.A1)', () => {
  describe('when SAML is configured', () => {
    let strategy: SamlStrategy;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [
              () => ({
                SAML_ENTRY_POINT: 'https://idp.example.com/sso',
                SAML_ISSUER: 'atlas-test',
                SAML_CERT: 'test-cert-content',
                SAML_CALLBACK_URL: '/auth/saml/callback',
              }),
            ],
          }),
        ],
        providers: [SamlStrategy],
      }).compile();

      strategy = module.get(SamlStrategy);
    });

    it('should be configured when env vars are set', () => {
      expect(strategy.isConfigured()).toBe(true);
    });

    it('should return the SAML config', () => {
      const config = strategy.getConfig();
      expect(config).not.toBeNull();
      expect(config!.entryPoint).toBe('https://idp.example.com/sso');
      expect(config!.issuer).toBe('atlas-test');
      expect(config!.cert).toBe('test-cert-content');
      expect(config!.callbackUrl).toBe('/auth/saml/callback');
    });

    it('should validate a valid SAML assertion (base64 JSON)', () => {
      const profile: SamlProfile = {
        nameID: 'user-123',
        email: 'user@example.com',
        firstName: 'Test',
        lastName: 'User',
        groups: ['admin'],
      };
      const samlResponse = Buffer.from(JSON.stringify(profile)).toString('base64');

      const result = strategy.validateAssertion(samlResponse);
      expect(result).not.toBeNull();
      expect(result!.nameID).toBe('user-123');
      expect(result!.email).toBe('user@example.com');
      expect(result!.firstName).toBe('Test');
      expect(result!.lastName).toBe('User');
      expect(result!.groups).toEqual(['admin']);
    });

    it('should return null for assertion missing nameID', () => {
      const profile = { email: 'user@example.com' };
      const samlResponse = Buffer.from(JSON.stringify(profile)).toString('base64');

      const result = strategy.validateAssertion(samlResponse);
      expect(result).toBeNull();
    });

    it('should return null for assertion missing email', () => {
      const profile = { nameID: 'user-123' };
      const samlResponse = Buffer.from(JSON.stringify(profile)).toString('base64');

      const result = strategy.validateAssertion(samlResponse);
      expect(result).toBeNull();
    });

    it('should return null for invalid base64 data', () => {
      const result = strategy.validateAssertion('not-valid-base64!!!');
      expect(result).toBeNull();
    });

    it('should generate a login URL', () => {
      const url = strategy.generateLoginUrl();
      expect(url).toContain('https://idp.example.com/sso');
      expect(url).toContain('SAMLRequest=');
    });

    it('should include RelayState in the login URL when provided', () => {
      const url = strategy.generateLoginUrl('/dashboard');
      expect(url).toContain('RelayState=%2Fdashboard');
    });
  });

  describe('when SAML is NOT configured', () => {
    let strategy: SamlStrategy;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            load: [() => ({})],
          }),
        ],
        providers: [SamlStrategy],
      }).compile();

      strategy = module.get(SamlStrategy);
    });

    it('should not be configured', () => {
      expect(strategy.isConfigured()).toBe(false);
    });

    it('should return null config', () => {
      expect(strategy.getConfig()).toBeNull();
    });

    it('should return null for any assertion', () => {
      const profile = { nameID: 'test', email: 'test@example.com' };
      const samlResponse = Buffer.from(JSON.stringify(profile)).toString('base64');
      expect(strategy.validateAssertion(samlResponse)).toBeNull();
    });

    it('should throw when generating login URL', () => {
      expect(() => strategy.generateLoginUrl()).toThrow('SAML not configured');
    });
  });
});
