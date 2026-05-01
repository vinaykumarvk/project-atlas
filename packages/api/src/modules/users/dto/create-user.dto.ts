import {
  IsEmail,
  IsString,
  IsArray,
  IsOptional,
  MinLength,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '../../auth/auth.service';

export class CreateUserDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'John Doe' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({
    enum: UserRole,
    isArray: true,
    example: [UserRole.COLLATERAL_OFFICER],
  })
  @IsArray()
  @IsEnum(UserRole, { each: true })
  roles!: UserRole[];

  @ApiPropertyOptional({ example: 'NORTH' })
  @IsOptional()
  @IsString()
  region?: string;
}
