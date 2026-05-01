import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Roles } from '../../../common/guards/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { MfaGuard } from '../../../common/guards/mfa.guard';
import { RequiresMfa } from '../../../common/guards/requires-mfa.decorator';
import { UserRole } from '../../auth/auth.service';
import { MakerCheckerService, ChangeStatus } from '../services/maker-checker.service';
import { EffectiveDatingService } from '../services/effective-dating.service';
import { BulkImportService } from '../services/bulk-import.service';
import { ProposeChangeDto } from '../dto/propose-change.dto';
import { RejectChangeDto } from '../dto/reject-change.dto';

/**
 * Interface representing the authenticated user on the request.
 */
interface AuthenticatedRequest {
  user: {
    sub: string;
    email: string;
    roles: UserRole[];
    region?: string;
  };
}

/**
 * Generic REST controller for all master data tables.
 *
 * Provides CRUD operations, maker-checker workflow, bulk import/export,
 * and temporal queries via effective dating.
 *
 * All mutation endpoints require MASTER_DATA_ADMIN role.
 * Approval endpoints require MASTER_DATA_APPROVER role.
 */
@ApiTags('Master Data')
@ApiBearerAuth()
@Controller('masters')
@UseGuards(AuthGuard('jwt'), RolesGuard, MfaGuard)
export class MastersController {
  constructor(
    private readonly makerCheckerService: MakerCheckerService,
    private readonly effectiveDatingService: EffectiveDatingService,
    private readonly bulkImportService: BulkImportService,
  ) {}

  /**
   * List pending changes (approver inbox).
   * NOTE: Must be defined BEFORE @Get(':masterName') to avoid route shadowing.
   */
  @Get('changes')
  @ApiOperation({ summary: 'List master data changes (approver inbox)' })
  @ApiQuery({ name: 'status', required: false, enum: ChangeStatus })
  @ApiResponse({ status: 200, description: 'List of changes' })
  async listChanges(@Query('status') status?: string) {
    if (status && Object.values(ChangeStatus).includes(status as ChangeStatus)) {
      return {
        data: await this.makerCheckerService.getByStatus(status as ChangeStatus),
      };
    }
    return { data: await this.makerCheckerService.getAll() };
  }

  /**
   * List records for a master table with pagination, search, and filters.
   */
  @Get(':masterName')
  @ApiOperation({ summary: 'List master data records with pagination' })
  @ApiParam({ name: 'masterName', description: 'Master table name', example: 'property_location_masters' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (1-based)' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Records per page' })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Search term' })
  @ApiQuery({ name: 'as_of_date', required: false, type: String, description: 'Point-in-time query (ISO date)' })
  @ApiResponse({ status: 200, description: 'Paginated list of master records' })
  async list(
    @Param('masterName') masterName: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('as_of_date') asOfDate?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10) || 20));

    const queryDate = asOfDate ? new Date(asOfDate) : undefined;
    const allRecords = await this.effectiveDatingService.getActiveRecords(
      masterName,
      queryDate,
    );

    // Simple search filter
    let filtered = allRecords;
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = allRecords.filter((record) =>
        JSON.stringify(record.data).toLowerCase().includes(searchLower),
      );
    }

    // Pagination
    const total = filtered.length;
    const startIndex = (pageNum - 1) * pageSize;
    const paginatedRecords = filtered.slice(startIndex, startIndex + pageSize);

    return {
      data: paginatedRecords,
      meta: {
        page: pageNum,
        limit: pageSize,
        total,
        total_pages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Get a single master record by ID.
   */
  @Get(':masterName/:id')
  @ApiOperation({ summary: 'Get a single master data record' })
  @ApiParam({ name: 'masterName', description: 'Master table name' })
  @ApiParam({ name: 'id', description: 'Record ID' })
  @ApiQuery({ name: 'as_of_date', required: false, type: String })
  @ApiResponse({ status: 200, description: 'Master record details' })
  @ApiResponse({ status: 404, description: 'Record not found' })
  async getOne(
    @Param('masterName') masterName: string,
    @Param('id') id: string,
    @Query('as_of_date') asOfDate?: string,
  ) {
    const queryDate = asOfDate ? new Date(asOfDate) : undefined;
    const record = await this.effectiveDatingService.getActiveVersion(
      masterName,
      id,
      queryDate,
    );

    if (!record) {
      throw new BadRequestException(
        `Record ${id} not found in ${masterName}`,
      );
    }

    return { data: record };
  }

  /**
   * Propose a change to a master record (maker step).
   */
  @Post(':masterName/changes')
  @Roles(UserRole.MASTER_DATA_ADMIN, UserRole.SYS_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Propose a master data change (maker-checker)' })
  @ApiParam({ name: 'masterName', description: 'Master table name' })
  @ApiResponse({ status: 201, description: 'Change proposed successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  async proposeChange(
    @Param('masterName') masterName: string,
    @Body() dto: ProposeChangeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const makerId = req.user.sub;
    const effectiveAt = dto.effective_at ? new Date(dto.effective_at) : null;

    const change = await this.makerCheckerService.proposeChange(
      masterName,
      dto.record_id ?? null,
      dto.action,
      dto.after_data,
      makerId,
      {
        beforeData: dto.before_data ?? null,
        effectiveAt,
      },
    );

    return { data: change, message: 'Change proposed successfully' };
  }

  /**
   * Approve a pending change (checker step).
   */
  @Patch('changes/:changeId/approve')
  @RequiresMfa()
  @Roles(UserRole.MASTER_DATA_APPROVER, UserRole.SYS_ADMIN)
  @ApiOperation({ summary: 'Approve a pending master data change' })
  @ApiParam({ name: 'changeId', description: 'Change log ID' })
  @ApiResponse({ status: 200, description: 'Change approved' })
  @ApiResponse({ status: 400, description: 'Self-approval or invalid state' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Change not found' })
  async approveChange(
    @Param('changeId') changeId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const checkerId = req.user.sub;
    const change = await this.makerCheckerService.approveChange(changeId, checkerId);
    return { data: change, message: 'Change approved successfully' };
  }

  /**
   * Reject a pending change with a reason (checker step).
   */
  @Patch('changes/:changeId/reject')
  @RequiresMfa()
  @Roles(UserRole.MASTER_DATA_APPROVER, UserRole.SYS_ADMIN)
  @ApiOperation({ summary: 'Reject a pending master data change' })
  @ApiParam({ name: 'changeId', description: 'Change log ID' })
  @ApiResponse({ status: 200, description: 'Change rejected' })
  @ApiResponse({ status: 400, description: 'Self-approval, invalid state, or missing reason' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Change not found' })
  async rejectChange(
    @Param('changeId') changeId: string,
    @Body() dto: RejectChangeDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const checkerId = req.user.sub;
    const change = await this.makerCheckerService.rejectChange(
      changeId,
      checkerId,
      dto.reason,
    );
    return { data: change, message: 'Change rejected' };
  }

  /**
   * Bulk import master data from CSV/Excel file.
   */
  @Post(':masterName/import')
  @Roles(UserRole.MASTER_DATA_ADMIN, UserRole.SYS_ADMIN)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Bulk import master data from CSV/Excel' })
  @ApiParam({ name: 'masterName', description: 'Master table name' })
  @ApiResponse({ status: 200, description: 'Import results' })
  @ApiResponse({ status: 400, description: 'No file uploaded or validation errors' })
  async bulkImport(
    @Param('masterName') masterName: string,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string } | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const rows = this.bulkImportService.parseFile(
      file.buffer,
      file.mimetype,
    );

    if (rows.length === 0) {
      throw new BadRequestException('File is empty or has no data rows');
    }

    const { valid, errors } = this.bulkImportService.validateRows(
      rows,
      masterName,
    );

    if (valid.length === 0) {
      return {
        message: 'All rows failed validation',
        total_rows: rows.length,
        valid_count: 0,
        error_count: errors.length,
        errors,
      };
    }

    const makerId = req.user.sub;
    const batchResult = await this.bulkImportService.submitBatch(
      valid,
      masterName,
      makerId,
    );

    return {
      message: `Import submitted: ${valid.length} valid rows, ${errors.length} errors`,
      batch_id: batchResult.batch_id,
      total_rows: rows.length,
      valid_count: valid.length,
      error_count: errors.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * FR-042.A3: Rollback a master data record to a previous version.
   */
  @Post(':masterName/:id/rollback')
  @Roles(UserRole.MASTER_DATA_ADMIN, UserRole.SYS_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rollback a master data record to a previous version' })
  @ApiParam({ name: 'masterName', description: 'Master table name' })
  @ApiParam({ name: 'id', description: 'Record ID' })
  @ApiResponse({ status: 200, description: 'Record rolled back' })
  async rollbackRecord(
    @Param('masterName') masterName: string,
    @Param('id') id: string,
    @Body() body: { targetVersion: number },
    @Req() req: AuthenticatedRequest,
  ) {
    const rollback = await this.effectiveDatingService.rollbackToVersion(
      masterName,
      id,
      body.targetVersion,
    );

    return {
      data: rollback,
      message: `Record ${id} rolled back to version ${body.targetVersion}`,
    };
  }

  /**
   * Export master data as CSV with historical versions from maker-checker audit trail (FR-041 A3).
   */
  @Get(':masterName/export')
  @ApiOperation({ summary: 'Export master data as CSV with version history' })
  @ApiParam({ name: 'masterName', description: 'Master table name' })
  @ApiQuery({ name: 'include_history', required: false, type: Boolean, description: 'Include previous versions' })
  @ApiResponse({ status: 200, description: 'CSV file download' })
  async exportCsv(
    @Param('masterName') masterName: string,
    @Query('include_history') includeHistory?: string,
  ) {
    const records = await this.effectiveDatingService.getActiveRecords(masterName);

    // FR-041 A3: Gather historical versions from maker-checker audit trail
    const allChanges = includeHistory === 'true'
      ? await this.makerCheckerService.getAll(10000)
      : [];
    const relevantChanges = allChanges.filter(
      (c) => c.master_table === masterName && c.status === 'APPROVED',
    );

    if (records.length === 0 && relevantChanges.length === 0) {
      return {
        content_type: 'text/csv',
        filename: `${masterName}_export.csv`,
        data: '',
      };
    }

    // Collect all unique keys from all records' data
    const allKeys = new Set<string>();
    records.forEach((r) => {
      Object.keys(r.data).forEach((k) => allKeys.add(k));
    });
    // Also collect keys from historical after_json
    relevantChanges.forEach((c) => {
      if (c.after_json) {
        Object.keys(c.after_json).forEach((k) => allKeys.add(k));
      }
    });

    const headers = Array.from(allKeys);
    // FR-041 A3: Append version tracking columns
    const versionHeaders = [...headers, '_version', '_effective_from', '_changed_by'];

    // Build CSV
    const csvLines: string[] = [versionHeaders.join(',')];

    const escapeField = (val: unknown): string => {
      if (val === null || val === undefined) return '';
      const str = String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    // Current records (latest version)
    records.forEach((record) => {
      const values = headers.map((h) => escapeField(record.data[h]));
      values.push(String(record.version ?? 1));
      values.push(record.effective_from ? record.effective_from.toISOString() : '');
      values.push(''); // current version: no specific changed_by
      csvLines.push(values.join(','));
    });

    // FR-041.A3: Historical versions from maker-checker log, sorted by effective date
    if (includeHistory === 'true') {
      const sortedChanges = [...relevantChanges].sort((a, b) => {
        const dateA = a.effective_at || a.submitted_at;
        const dateB = b.effective_at || b.submitted_at;
        return dateA.getTime() - dateB.getTime();
      });

      sortedChanges.forEach((change, idx) => {
        const data = change.after_json || change.before_json || {};
        const values = headers.map((h) => escapeField(data[h]));
        values.push(String(idx + 1));
        values.push(change.effective_at ? change.effective_at.toISOString() : change.submitted_at.toISOString());
        values.push(change.maker_id || '');
        csvLines.push(values.join(','));
      });
    }

    return {
      content_type: 'text/csv',
      filename: `${masterName}_export.csv`,
      data: csvLines.join('\n'),
    };
  }
}
