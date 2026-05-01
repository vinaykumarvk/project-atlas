import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/guards/roles.decorator';
import { UserRole } from '../auth.service';
import { PrismaService } from '../../../common/prisma';

/**
 * SCIM 2.0 schema helper: formats a user record into SCIM JSON.
 */
function toScimUser(user: {
  id: string;
  email: string;
  full_name?: string | null;
  is_active?: boolean;
  created_at?: Date;
  updated_at?: Date;
}) {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: user.id,
    userName: user.email,
    name: {
      formatted: user.full_name || user.email,
    },
    emails: [
      {
        value: user.email,
        primary: true,
      },
    ],
    active: user.is_active !== false,
    meta: {
      resourceType: 'User',
      created: user.created_at?.toISOString(),
      lastModified: user.updated_at?.toISOString(),
    },
  };
}

/**
 * FR-143.A3: SCIM 2.0 User provisioning controller.
 *
 * Provides /scim/v2/Users CRUD endpoints for identity provider
 * integration (e.g. Azure AD, Okta).
 */
@ApiTags('SCIM')
@ApiBearerAuth()
@Controller('scim/v2')
@UseGuards(AuthGuard('jwt'), RolesGuard)
export class ScimController {
  private readonly logger = new Logger(ScimController.name);

  constructor(private readonly prisma: PrismaService) {}

  @Get('Users')
  @Roles(UserRole.SYS_ADMIN)
  @ApiOperation({ summary: 'List SCIM users' })
  async listUsers(
    @Query('startIndex') startIndex?: string,
    @Query('count') count?: string,
    @Query('filter') filter?: string,
  ) {
    const start = startIndex ? Math.max(parseInt(startIndex, 10) - 1, 0) : 0;
    const limit = count ? parseInt(count, 10) : 100;

    const where: Record<string, unknown> = {};
    // Support basic SCIM filter: userName eq "value"
    if (filter) {
      const match = filter.match(/userName\s+eq\s+"([^"]+)"/);
      if (match) {
        where.email = match[1];
      }
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: start,
        take: limit,
        orderBy: { created_at: 'asc' },
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: total,
      startIndex: start + 1,
      itemsPerPage: limit,
      Resources: users.map((u: { id: string; email: string; full_name?: string | null; is_active?: boolean; created_at?: Date; updated_at?: Date }) => toScimUser(u)),
    };
  }

  @Get('Users/:id')
  @Roles(UserRole.SYS_ADMIN)
  @ApiOperation({ summary: 'Get a SCIM user by ID' })
  async getUser(@Param('id') id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User not found: ${id}`);
    }
    return toScimUser(user);
  }

  @Post('Users')
  @Roles(UserRole.SYS_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a SCIM user' })
  async createUser(
    @Body()
    body: {
      schemas?: string[];
      userName: string;
      name?: { formatted?: string; givenName?: string; familyName?: string };
      emails?: { value: string; primary?: boolean }[];
      active?: boolean;
    },
  ) {
    const email = body.userName || body.emails?.[0]?.value;
    if (!email) {
      throw new BadRequestException('userName or emails[0].value is required');
    }

    const name =
      body.name?.formatted ||
      [body.name?.givenName, body.name?.familyName].filter(Boolean).join(' ') ||
      email;

    const user = await this.prisma.user.create({
      data: {
        email,
        full_name: name,
      },
    });

    this.logger.log(`SCIM user created: ${user.id} (${email})`);
    return toScimUser(user);
  }

  @Patch('Users/:id')
  @Roles(UserRole.SYS_ADMIN)
  @ApiOperation({ summary: 'Patch a SCIM user' })
  async patchUser(
    @Param('id') id: string,
    @Body()
    body: {
      schemas?: string[];
      Operations?: {
        op: string;
        path?: string;
        value?: unknown;
      }[];
    },
  ) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`User not found: ${id}`);
    }

    const updates: Record<string, unknown> = {};

    for (const op of body.Operations || []) {
      if (op.path === 'active' || op.path === 'urn:ietf:params:scim:schemas:core:2.0:User:active') {
        // SCIM active toggle — store as a field or handle deactivation
        if (op.op === 'replace' || op.op === 'Replace') {
          updates.is_active = op.value;
        }
      }
      if (op.path === 'userName') {
        if (op.op === 'replace' || op.op === 'Replace') {
          updates.email = op.value;
        }
      }
      if (op.path === 'name.formatted' || op.path === 'displayName') {
        if (op.op === 'replace' || op.op === 'Replace') {
          updates.full_name = op.value;
        }
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: updates,
    });

    this.logger.log(`SCIM user patched: ${id}`);
    return toScimUser(updated);
  }

  @Delete('Users/:id')
  @Roles(UserRole.SYS_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a SCIM user' })
  async deleteUser(@Param('id') id: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException(`User not found: ${id}`);
    }

    await this.prisma.user.delete({ where: { id } });
    this.logger.log(`SCIM user deleted: ${id}`);
  }
}
