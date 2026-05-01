import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Roles } from '../../../common/guards/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { UserRole } from '../../auth/auth.service';
import { Audited } from '../../audit/decorators/audited.decorator';
import { EmailIngestService } from '../email-ingest.service';
import { IngestFixtureDto } from '../dto/ingest-fixture.dto';
import { RawEmail } from '../types';

/**
 * Email Ingest Controller.
 *
 * Provides REST endpoints for email ingestion:
 * submitting email fixtures, listing ingested records,
 * and triggering classification + case creation.
 */
@ApiTags('Email Ingest')
@ApiBearerAuth()
@Controller('email-ingest')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Audited({ resourceType: 'EmailIngest' })
export class EmailIngestController {
  constructor(
    private readonly emailIngestService: EmailIngestService,
    @InjectQueue('intake') private readonly intakeQueue: Queue,
  ) {}

  /**
   * Submit a JSON email fixture for ingestion.
   */
  @Post('fixtures')
  @Roles(UserRole.SYS_ADMIN, UserRole.COLLATERAL_OFFICER, UserRole.COLLATERAL_LEAD, UserRole.API_SERVICE_ACCOUNT)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a JSON email fixture for ingestion' })
  @ApiResponse({ status: 201, description: 'Email ingested successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  async ingestFixture(@Body() dto: IngestFixtureDto) {
    const rawEmail: RawEmail = {
      messageId: dto.messageId,
      from: dto.from,
      to: dto.to,
      cc: dto.cc || [],
      subject: dto.subject,
      bodyText: dto.bodyText,
      bodyHtml: dto.bodyHtml,
      receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : new Date(),
      headers: dto.headers || {},
      attachments: [],
    };

    const result = await this.emailIngestService.ingest(rawEmail, dto.provider || 'fixture');

    return { data: result, message: 'Email ingested successfully' };
  }

  /**
   * List ingested emails with pagination.
   */
  @Get()
  @ApiOperation({ summary: 'List ingested emails with pagination' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (1-based)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Records per page' })
  @ApiResponse({ status: 200, description: 'Paginated list of ingested emails' })
  async listIngestedEmails(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10) || 20));
    const offset = (pageNum - 1) * pageSize;

    const records = await this.emailIngestService.getRecords(pageSize, offset);

    return {
      data: records,
      meta: {
        page: pageNum,
        limit: pageSize,
      },
    };
  }

  /**
   * Get a single ingest record by ID.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get a single ingest record by ID' })
  @ApiParam({ name: 'id', description: 'Ingest record ID' })
  @ApiResponse({ status: 200, description: 'Ingest record detail' })
  @ApiResponse({ status: 404, description: 'Record not found' })
  async getIngestRecord(@Param('id') id: string) {
    const record = await this.emailIngestService.findByMessageId(id);
    if (!record) {
      throw new NotFoundException(`Ingest record not found: ${id}`);
    }
    return { data: record };
  }

  /**
   * Trigger classification + case creation for an ingested email.
   * Enqueues an intake job on the BullMQ 'intake' queue for async processing.
   */
  @Post(':id/process')
  @Roles(UserRole.SYS_ADMIN, UserRole.COLLATERAL_OFFICER, UserRole.COLLATERAL_LEAD, UserRole.API_SERVICE_ACCOUNT)
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Trigger classification and case creation for an ingested email' })
  @ApiParam({ name: 'id', description: 'Ingest record ID' })
  @ApiResponse({ status: 202, description: 'Intake job enqueued successfully' })
  @ApiResponse({ status: 404, description: 'Record not found' })
  async processIngest(@Param('id') id: string) {
    const job = await this.intakeQueue.add('process', { ingestId: id });
    return { data: { jobId: job.id, ingestId: id }, message: 'Intake job enqueued successfully' };
  }
}
