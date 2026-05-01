import { IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for correcting an AI classification during triage.
 */
export class TriageCorrectDto {
  @ApiProperty({ description: 'Corrected case type', example: 'LEGAL_OPINION' })
  @IsString()
  @IsNotEmpty()
  correctedCaseType!: string;

  @ApiPropertyOptional({ description: 'Corrected priority', example: 'HIGH' })
  @IsString()
  @IsOptional()
  correctedPriority?: string;

  @ApiPropertyOptional({ description: 'Correction reason', example: 'Email actually requests legal opinion, not valuation.' })
  @IsString()
  @IsOptional()
  reason?: string;
}
