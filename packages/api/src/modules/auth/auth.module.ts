import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SamlStrategy } from './strategies/saml.strategy';
import { AuthModeConfig } from './config/auth-mode.config';
import { SessionController } from './bff/session.controller';
import { CsrfGuard } from './bff/csrf.guard';
import { JitElevationService } from './services/jit-elevation.service';
import { JitAccessService } from './services/jit-access.service';
import { ScimController } from './controllers/scim.controller';

@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 5,
    }]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET environment variable is required');
        }
        return {
          secret,
          signOptions: { expiresIn: '60m' },
        };
      },
    }),
  ],
  controllers: [AuthController, SessionController, ScimController],
  providers: [
    AuthService,
    AuthModeConfig,
    JwtStrategy,
    SamlStrategy,
    CsrfGuard,
    JitElevationService,
    JitAccessService,
  ],
  exports: [
    AuthService,
    AuthModeConfig,
    JwtModule,
    PassportModule,
    SamlStrategy,
    JitElevationService,
    JitAccessService,
  ],
})
export class AuthModule {}
