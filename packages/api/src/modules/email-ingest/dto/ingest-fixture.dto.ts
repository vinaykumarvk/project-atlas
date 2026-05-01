import {
  IsNotEmpty,
  IsString,
  IsArray,
  IsOptional,
  IsObject,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for submitting a JSON email fixture for ingestion.
 */
export class IngestFixtureDto {
  @ApiProperty({ description: 'Unique message ID from email headers', example: '<abc123@mail.example.com>' })
  @IsString()
  @IsNotEmpty()
  messageId!: string;

  @ApiProperty({ description: 'Sender email address', example: 'customer@example.com' })
  @IsString()
  @IsNotEmpty()
  from!: string;

  @ApiProperty({ description: 'Recipient email addresses', example: ['collateral@bank.com'] })
  @IsArray()
  @IsString({ each: true })
  to!: string[];

  @ApiPropertyOptional({ description: 'CC email addresses', example: [] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  cc?: string[];

  @ApiProperty({ description: 'Email subject', example: 'Valuation Request for Property at Mumbai' })
  @IsString()
  @IsNotEmpty()
  subject!: string;

  @ApiPropertyOptional({ description: 'Plain-text email body' })
  @IsString()
  @IsOptional()
  bodyText?: string;

  @ApiPropertyOptional({ description: 'HTML email body' })
  @IsString()
  @IsOptional()
  bodyHtml?: string;

  @ApiPropertyOptional({ description: 'Email received timestamp (ISO 8601)', example: '2026-04-29T10:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  receivedAt?: string;

  @ApiPropertyOptional({ description: 'Email headers as key-value map', example: {} })
  @IsObject()
  @IsOptional()
  headers?: Record<string, string>;

  @ApiPropertyOptional({ description: 'Mail provider name', example: 'fixture', default: 'fixture' })
  @IsString()
  @IsOptional()
  provider?: string;
}
