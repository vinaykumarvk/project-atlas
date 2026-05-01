import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for confirming an AI classification suggestion during triage.
 */
export class TriageConfirmDto {
  @ApiPropertyOptional({ description: 'Optional notes from the triage officer', example: 'Classification looks correct.' })
  @IsString()
  @IsOptional()
  notes?: string;
}
