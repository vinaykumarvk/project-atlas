import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for triggering classification + case creation on an ingested email.
 */
export class ProcessIngestDto {
  @ApiPropertyOptional({ description: 'Override provider for classification', example: 'fixture' })
  @IsString()
  @IsOptional()
  provider?: string;
}
