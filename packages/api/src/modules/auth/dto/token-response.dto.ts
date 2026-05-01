import { ApiProperty } from '@nestjs/swagger';

export class TokenResponseDto {
  @ApiProperty({ description: 'JWT access token' })
  access_token!: string;

  @ApiProperty({ description: 'JWT refresh token' })
  refresh_token!: string;

  @ApiProperty({ description: 'Access token expiry in seconds', example: 3600 })
  expires_in!: number;

  @ApiProperty({ description: 'Token type', example: 'Bearer' })
  token_type!: string;
}
