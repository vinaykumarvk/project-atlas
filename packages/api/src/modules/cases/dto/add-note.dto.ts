import { IsNotEmpty, IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for adding an activity note to a case.
 */
export class AddNoteDto {
  @ApiProperty({ description: 'Note content', example: 'Contacted customer for additional documents.' })
  @IsString()
  @IsNotEmpty()
  note!: string;

  @ApiPropertyOptional({ description: 'Whether the note is private (FR-054 A1)', example: false })
  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;
}
