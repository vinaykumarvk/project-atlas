import {
  Controller,
  Get,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { PrismaService } from '../../../common/prisma';

@ApiTags('OData')
@ApiBearerAuth()
@Controller('odata')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ODataController {
  private readonly logger = new Logger(ODataController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get('cases')
  @ApiOperation({ summary: 'OData v4 compatible case query endpoint' })
  @ApiQuery({ name: '$filter', required: false, description: 'OData filter expression' })
  @ApiQuery({ name: '$select', required: false, description: 'Comma-separated fields to return' })
  @ApiQuery({ name: '$orderby', required: false, description: 'Sort expression' })
  @ApiQuery({ name: '$top', required: false, type: Number, description: 'Limit results' })
  @ApiQuery({ name: '$skip', required: false, type: Number, description: 'Skip results' })
  @ApiResponse({ status: 200, description: 'OData v4 formatted response' })
  async queryCases(
    @Query('$filter') filter?: string,
    @Query('$select') select?: string,
    @Query('$orderby') orderby?: string,
    @Query('$top') top?: string,
    @Query('$skip') skip?: string,
  ) {
    const take = Math.min(100, Math.max(1, parseInt(top ?? '20', 10) || 20));
    const skipCount = Math.max(0, parseInt(skip ?? '0', 10) || 0);

    // Parse filter to Prisma where clause
    const where = this.parseFilter(filter);

    // Parse orderby to Prisma orderBy
    const orderBy = this.parseOrderBy(orderby);

    // Parse select to Prisma select
    const selectFields = this.parseSelect(select);

    const [cases, count] = await Promise.all([
      this.prisma.case.findMany({
        where,
        orderBy,
        take,
        skip: skipCount,
        ...(selectFields ? { select: selectFields } : {}),
      }),
      this.prisma.case.count({ where }),
    ]);

    return {
      '@odata.context': '$metadata#Cases',
      '@odata.count': count,
      value: cases.map((c: any) => ({
        id: c.id,
        caseNumber: c.case_number,
        caseType: c.case_type,
        status: c.status,
        priority: c.priority,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        ...(c.assigned_fpr_id && { assignedFprId: c.assigned_fpr_id }),
        ...(c.loan_account_no && { loanAccountNo: c.loan_account_no }),
      })),
    };
  }

  parseFilter(filter?: string): any {
    if (!filter) return {};
    const where: any = {};

    // Simple OData filter parser for common patterns
    const eqMatch = filter.match(/(\w+)\s+eq\s+'([^']+)'/);
    if (eqMatch) {
      const [, field, value] = eqMatch;
      const fieldMap: Record<string, string> = {
        status: 'status',
        caseType: 'case_type',
        priority: 'priority',
      };
      const prismaField = fieldMap[field] || field;
      where[prismaField] = value;
    }

    return where;
  }

  parseOrderBy(orderby?: string): any {
    if (!orderby) return { created_at: 'desc' };

    const parts = orderby.split(' ');
    const field = parts[0];
    const dir = parts[1]?.toLowerCase() === 'asc' ? 'asc' : 'desc';

    const fieldMap: Record<string, string> = {
      createdAt: 'created_at',
      updatedAt: 'updated_at',
      status: 'status',
      priority: 'priority',
    };

    return { [fieldMap[field] || field]: dir };
  }

  parseSelect(select?: string): any {
    if (!select) return undefined;

    const fields = select.split(',').map((f) => f.trim());
    const selectObj: any = {};
    const fieldMap: Record<string, string> = {
      id: 'id',
      caseNumber: 'case_number',
      caseType: 'case_type',
      status: 'status',
      priority: 'priority',
      createdAt: 'created_at',
    };

    for (const field of fields) {
      const prismaField = fieldMap[field] || field;
      selectObj[prismaField] = true;
    }

    // Always include id
    selectObj.id = true;
    return selectObj;
  }
}
