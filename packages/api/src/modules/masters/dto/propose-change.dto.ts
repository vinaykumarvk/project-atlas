import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChangeAction } from '../services/maker-checker.service';

/**
 * DTO for proposing a master data change through the maker-checker workflow.
 */
export class ProposeChangeDto {
  @ApiProperty({
    description: 'The action to perform on the master record',
    enum: ChangeAction,
    example: ChangeAction.UPDATE,
  })
  @IsEnum(ChangeAction)
  @IsNotEmpty()
  action!: ChangeAction;

  @ApiPropertyOptional({
    description: 'The ID of the existing record to modify (null for CREATE)',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @IsOptional()
  record_id?: string;

  @ApiProperty({
    description: 'The data to apply (new values for CREATE/UPDATE, or record snapshot for DELETE)',
    example: { state: 'Maharashtra', city: 'Mumbai', pin_from: '400001', pin_to: '400099' },
  })
  @IsObject()
  @IsNotEmpty()
  after_data!: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'The current/before data snapshot (for UPDATE/DELETE audit trail)',
    example: { state: 'Maharashtra', city: 'Bombay', pin_from: '400001', pin_to: '400099' },
  })
  @IsObject()
  @IsOptional()
  before_data?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: 'When the change should become effective (ISO 8601 date-time)',
    example: '2026-05-01T00:00:00.000Z',
  })
  @IsDateString()
  @IsOptional()
  effective_at?: string;
}
