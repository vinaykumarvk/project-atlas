import { IsNotEmpty, IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for reassigning a case to a different FPR.
 */
export class AssignCaseDto {
  @ApiProperty({ description: 'Target FPR user ID', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsString()
  @IsNotEmpty()
  assigneeId!: string;

  @ApiPropertyOptional({ description: 'Reason for reassignment', example: 'Original FPR on leave' })
  @IsString()
  @IsOptional()
  reason?: string;
}
