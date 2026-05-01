import { IsNotEmpty, IsString, IsOptional, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for vendor response submission (FR-082).
 *
 * Accepts structured fields alongside file uploads.
 * Files are handled via multipart; this DTO covers the JSON fields.
 */
export class VendorResponseDto {
  @ApiProperty({ description: 'Summary of the vendor response', example: 'Valuation report completed for property at 123 Main St.' })
  @IsString()
  @IsNotEmpty()
  summary!: string;

  @ApiPropertyOptional({ description: 'Detailed remarks from the vendor', example: 'Property inspected on 2026-04-28. No structural issues found.' })
  @IsString()
  @IsOptional()
  remarks?: string;

  @ApiPropertyOptional({ description: 'List of deliverable descriptions', example: '["Valuation Report PDF", "Site Photos"]' })
  @IsArray()
  @IsOptional()
  deliverables?: string[];

  @ApiPropertyOptional({ description: 'List of uploaded file references (simulated multipart)', example: '["file1.pdf", "photo1.jpg"]' })
  @IsArray()
  @IsOptional()
  fileNames?: string[];
}
