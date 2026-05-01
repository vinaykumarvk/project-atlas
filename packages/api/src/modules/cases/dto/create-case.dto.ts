import { IsNotEmpty, IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for manual case creation.
 */
export class CreateCaseDto {
  @ApiProperty({ description: 'Email ingest record ID', example: '550e8400-e29b-41d4-a716-446655440000' })
  @IsString()
  @IsNotEmpty()
  emailIngestId!: string;

  @ApiProperty({ description: 'Email subject', example: 'Valuation Request for Loan 12345' })
  @IsString()
  @IsNotEmpty()
  subject!: string;

  @ApiProperty({ description: 'Sender email address', example: 'customer@example.com' })
  @IsString()
  @IsNotEmpty()
  from!: string;

  @ApiProperty({ description: 'Case type classification', example: 'VALUATION_REQUEST' })
  @IsString()
  @IsNotEmpty()
  caseType!: string;

  @ApiProperty({ description: 'Confidence band', example: 'GREEN', enum: ['GREEN', 'AMBER', 'RED', 'RED_MANUAL'] })
  @IsString()
  @IsNotEmpty()
  confidenceBand!: string;

  @ApiProperty({ description: 'Priority level', example: 'HIGH', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
  @IsString()
  @IsNotEmpty()
  priority!: string;

  @ApiPropertyOptional({ description: 'Loan account number', example: 'LN-000012345' })
  @IsString()
  @IsOptional()
  loanAccountNo?: string;

  @ApiPropertyOptional({ description: 'Customer name', example: 'John Smith' })
  @IsString()
  @IsOptional()
  customerName?: string;

  @ApiPropertyOptional({ description: 'Property city', example: 'Mumbai' })
  @IsString()
  @IsOptional()
  propertyCity?: string;

  @ApiPropertyOptional({ description: 'Property PIN code', example: '400001' })
  @IsString()
  @IsOptional()
  propertyPin?: string;

  @ApiPropertyOptional({ description: 'Detected language', example: 'en' })
  @IsString()
  @IsOptional()
  languageDetected?: string;
}
