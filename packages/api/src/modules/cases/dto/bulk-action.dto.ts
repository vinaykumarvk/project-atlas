import {
  IsNotEmpty,
  IsString,
  IsEnum,
  IsArray,
  ArrayMaxSize,
  ArrayMinSize,
  IsOptional,
  ValidateNested,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * Supported bulk actions.
 */
export enum BulkAction {
  REASSIGN = 'REASSIGN',
  CHANGE_PRIORITY = 'CHANGE_PRIORITY',
  ADD_NOTE = 'ADD_NOTE',
  CLOSE = 'CLOSE',
  MERGE = 'MERGE',
}

/**
 * Payload shape varies by action:
 * - REASSIGN: { assigneeId: string, reason?: string }
 * - CHANGE_PRIORITY: { priority: string }
 * - ADD_NOTE: { note: string }
 * - CLOSE: { resolution_code: string, resolution_summary: string }
 */
export class BulkActionPayloadDto {
  @ApiPropertyOptional({ description: 'Target assignee ID (for REASSIGN)' })
  @IsString()
  @IsOptional()
  assigneeId?: string;

  @ApiPropertyOptional({ description: 'Reason for reassignment (for REASSIGN)' })
  @IsString()
  @IsOptional()
  reason?: string;

  @ApiPropertyOptional({ description: 'New priority (for CHANGE_PRIORITY)' })
  @IsString()
  @IsOptional()
  priority?: string;

  @ApiPropertyOptional({ description: 'Note text (for ADD_NOTE)' })
  @IsString()
  @IsOptional()
  note?: string;

  @ApiPropertyOptional({ description: 'Resolution code (for CLOSE)' })
  @IsString()
  @IsOptional()
  resolution_code?: string;

  @ApiPropertyOptional({ description: 'Resolution summary (for CLOSE)' })
  @IsString()
  @IsOptional()
  resolution_summary?: string;

  @ApiPropertyOptional({ description: 'Primary case ID for MERGE action' })
  @IsString()
  @IsOptional()
  primaryCaseId?: string;
}

/**
 * DTO for bulk case operations.
 * Accepts up to 100 case IDs and an action with a payload.
 */
export class BulkActionDto {
  @ApiProperty({
    description: 'The bulk action to perform',
    enum: BulkAction,
    example: BulkAction.REASSIGN,
  })
  @IsEnum(BulkAction)
  @IsNotEmpty()
  action!: BulkAction;

  @ApiProperty({
    description: 'Array of case IDs to apply the action to (max 100)',
    example: ['case-1', 'case-2'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  case_ids!: string[];

  @ApiProperty({
    description: 'Action-specific payload',
    type: BulkActionPayloadDto,
  })
  @ValidateNested()
  @Type(() => BulkActionPayloadDto)
  @IsObject()
  payload!: BulkActionPayloadDto;
}
