import { IsNotEmpty, IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CaseStatus } from '../types';

/**
 * DTO for transitioning a case to a new status.
 */
export class TransitionStatusDto {
  @ApiProperty({
    description: 'Target status for the case',
    enum: CaseStatus,
    example: CaseStatus.IN_PROGRESS,
  })
  @IsEnum(CaseStatus)
  @IsNotEmpty()
  targetStatus!: CaseStatus;

  @ApiPropertyOptional({ description: 'Reason for the status transition', example: 'FPR started working on case' })
  @IsString()
  @IsOptional()
  details?: string;

  @ApiPropertyOptional({ description: 'Resolution code (required when transitioning to RESOLVED or CLOSED)', example: 'COMPLETED' })
  @IsString()
  @IsOptional()
  resolution_code?: string;

  @ApiPropertyOptional({ description: 'Resolution summary (required when transitioning to RESOLVED or CLOSED)', example: 'Valuation completed successfully' })
  @IsString()
  @IsOptional()
  resolution_summary?: string;
}
