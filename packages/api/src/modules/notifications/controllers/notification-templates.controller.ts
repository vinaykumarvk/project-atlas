import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { PrismaService } from '../../../common/prisma';
import { NotificationDispatchService } from '../services/notification-dispatch.service';

/**
 * DTO for template preview.
 */
class PreviewTemplateDto {
  @ApiProperty({
    description: 'Template variables for rendering',
    example: { case_number: 'ATL-2026-000001', fpr_name: 'Amit Sharma' },
  })
  @IsObject()
  variables!: Record<string, unknown>;
}

/**
 * Notification Templates Controller (FR-101 A3).
 *
 * Provides admin endpoints for listing and previewing notification templates.
 * Templates are stored in the NotificationTemplate Prisma model.
 */
@ApiTags('Notification Templates')
@Controller('notification-templates')
export class NotificationTemplatesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatchService: NotificationDispatchService,
  ) {}

  /**
   * List all notification templates.
   */
  @Get()
  @ApiOperation({ summary: 'List all notification templates' })
  @ApiResponse({ status: 200, description: 'List of notification templates' })
  async listTemplates() {
    const templates = await this.prisma.notificationTemplate.findMany({
      where: { is_active: true, is_deleted: false },
      orderBy: { code: 'asc' },
    });

    return {
      data: templates.map((t) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        channel: t.channel,
        subject: t.subject,
        bodyTemplate: t.body_template,
        language: t.language,
        isActive: t.is_active,
      })),
    };
  }

  /**
   * Preview a template by rendering it with provided variables.
   */
  @Post(':code/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview a notification template with sample variables' })
  @ApiParam({ name: 'code', description: 'Template code' })
  @ApiResponse({ status: 200, description: 'Rendered template preview' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async previewTemplate(
    @Param('code') code: string,
    @Body() dto: PreviewTemplateDto,
  ) {
    const template = await this.prisma.notificationTemplate.findFirst({
      where: {
        code,
        is_active: true,
        is_deleted: false,
      },
    });

    if (!template) {
      throw new NotFoundException(`Template not found: ${code}`);
    }

    const renderedSubject = template.subject
      ? this.dispatchService.interpolate(template.subject, dto.variables)
      : '';
    const renderedBody = this.dispatchService.interpolate(
      template.body_template,
      dto.variables,
    );

    return {
      subject: renderedSubject,
      body: renderedBody,
    };
  }
}
