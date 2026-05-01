import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';

const TEST_JWT_SECRET = 'test-secret';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          // Provide JWT_SECRET so AuthService.getJwtSecret() uses the same key
          load: [() => ({ JWT_SECRET: TEST_JWT_SECRET })],
        }),
        JwtModule.register({
          secret: TEST_JWT_SECRET,
          signOptions: { expiresIn: '60m' },
        }),
      ],
      controllers: [AuthController],
      providers: [AuthService],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  describe('POST /auth/login', () => {
    it('should return tokens for valid credentials', async () => {
      const result = await controller.login({
        email: 'admin@atlas.dev',
        password: 'password123',
      });

      expect(result).toHaveProperty('access_token');
      expect(result).toHaveProperty('refresh_token');
      expect(result).toHaveProperty('expires_in', 3600);
      expect(result).toHaveProperty('token_type', 'Bearer');
      expect(typeof result.access_token).toBe('string');
      expect(typeof result.refresh_token).toBe('string');
    });

    it('should throw UnauthorizedException for invalid email', async () => {
      await expect(
        controller.login({
          email: 'nonexistent@atlas.dev',
          password: 'password123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      await expect(
        controller.login({
          email: 'admin@atlas.dev',
          password: 'wrongpassword',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should return different tokens for different users', async () => {
      const adminResult = await controller.login({
        email: 'admin@atlas.dev',
        password: 'password123',
      });

      const officerResult = await controller.login({
        email: 'officer@atlas.dev',
        password: 'password123',
      });

      expect(adminResult.access_token).not.toBe(officerResult.access_token);
      expect(adminResult.refresh_token).not.toBe(officerResult.refresh_token);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should return new tokens for a valid refresh token', async () => {
      const loginResult = await controller.login({
        email: 'admin@atlas.dev',
        password: 'password123',
      });

      const refreshResult = await controller.refresh({
        refresh_token: loginResult.refresh_token,
      });

      expect(refreshResult).toHaveProperty('access_token');
      expect(refreshResult).toHaveProperty('refresh_token');
      expect(refreshResult).toHaveProperty('expires_in', 3600);
      expect(refreshResult).toHaveProperty('token_type', 'Bearer');
    });

    it('should throw UnauthorizedException for an invalid refresh token', async () => {
      await expect(
        controller.refresh({ refresh_token: 'invalid-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject an access token used as a refresh token', async () => {
      const loginResult = await controller.login({
        email: 'admin@atlas.dev',
        password: 'password123',
      });

      await expect(
        controller.refresh({ refresh_token: loginResult.access_token }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
