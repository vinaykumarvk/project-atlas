import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for linking two cases together.
 */
export class LinkCasesDto {
  @ApiProperty({ description: 'ID of the case to link to', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsString()
  @IsNotEmpty()
  linkedCaseId!: string;
}
