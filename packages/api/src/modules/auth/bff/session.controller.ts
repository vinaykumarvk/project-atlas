import {
  Controller,
  Post,
  Delete,
  Body,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth.service';
import { LoginDto } from '../dto/login.dto';
import {
  setSessionCookie,
  clearSessionCookies,
} from './session.middleware';

/**
 * BFF session endpoints.
 *
 * POST /auth/session — authenticate and set httpOnly session cookie
 * DELETE /auth/session — logout and clear session cookie
 */
@ApiTags('Authentication')
@Controller('auth')
export class SessionController {
  private readonly logger = new Logger(SessionController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  @Post('session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Create BFF session (httpOnly cookie) from credentials',
  })
  @ApiResponse({ status: 200, description: 'Session created' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async createSession(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{
    message: string;
    expires_in: number;
    user: { id: string; email: string; roles: string[]; region?: string };
  }> {
    const tokens = await this.authService.login(
      loginDto.email,
      loginDto.password,
    );
    const payload = this.jwtService.decode(tokens.access_token) as {
      sub: string;
      email: string;
      roles?: string[];
      region?: string;
    };

    // Set httpOnly cookie with the access token
    setSessionCookie(res, tokens.access_token, tokens.expires_in);

    this.logger.log(`BFF session created for ${loginDto.email}`);

    return {
      message: 'Session created',
      expires_in: tokens.expires_in,
      user: {
        id: payload.sub,
        email: payload.email,
        roles: payload.roles ?? [],
        region: payload.region,
      },
    };
  }

  @Delete('session')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Destroy BFF session (clear cookie)' })
  @ApiResponse({ status: 200, description: 'Session destroyed' })
  async destroySession(
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    clearSessionCookies(res);
    this.logger.log('BFF session destroyed');
    return { message: 'Session destroyed' };
  }
}
