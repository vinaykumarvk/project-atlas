import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';
import { AuditLogService } from '../../audit/services/audit-log.service';

@Injectable()
export class InternalNotesService {
  private readonly logger = new Logger(InternalNotesService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly auditLogService?: AuditLogService,
  ) {}

  async addNote(
    caseId: string,
    content: string,
    isPrivate: boolean,
    authorId: string,
  ): Promise<{ id: string; mentions: string[] }> {
    const mentions = this.parseMentions(content);

    const entry = await this.prisma.caseActivityLog.create({
      data: {
        case_id: caseId,
        action_code: 'NOTE',
        actor_type: 'USER',
        actor_id: authorId,
        payload_json: {
          details: content,
          isPrivate,
          mentions,
        },
      },
    });

    // Emit audit log
    if (this.auditLogService) {
      await this.auditLogService.emit({
        event_code: 'INTERNAL_NOTE_CREATED',
        actor_type: 'USER',
        actor_id: authorId,
        resource_type: 'Case',
        resource_id: caseId,
        action: 'CREATE_NOTE',
        payload_json: {
          noteId: entry.id,
          isPrivate,
          mentionCount: mentions.length,
        },
      }).catch(() => {});
    }

    this.logger.log(`Note added to case ${caseId} by ${authorId} (private=${isPrivate}, mentions=${mentions.length})`);
    return { id: entry.id, mentions };
  }

  async getNotes(
    caseId: string,
    viewerRole: string,
  ): Promise<any[]> {
    const activities = await this.prisma.caseActivityLog.findMany({
      where: { case_id: caseId, action_code: 'NOTE' },
      orderBy: { created_at: 'desc' },
    });

    const privilegedRoles = ['COLLATERAL_OFFICER', 'COLLATERAL_LEAD', 'SYS_ADMIN', 'OFFICER', 'LEAD'];

    return activities.filter((a: any) => {
      const payload = a.payload_json as Record<string, unknown> | null;
      if (payload?.isPrivate === true && !privilegedRoles.includes(viewerRole)) {
        return false;
      }
      return true;
    });
  }

  parseMentions(content: string): string[] {
    const mentionRegex = /@([a-zA-Z0-9._-]+)/g;
    const mentions: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = mentionRegex.exec(content)) !== null) {
      mentions.push(match[1]);
    }
    return mentions;
  }
}
