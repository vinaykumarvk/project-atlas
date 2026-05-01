import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import { PrismaService, toJsonValue } from '../../../common/prisma';

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

export interface AuditEvent {
  event_code: string;
  actor_id?: string;
  actor_type?: 'USER' | 'SYSTEM' | 'SERVICE';
  resource_type?: string;
  resource_id?: string;
  action: string;
  payload_json?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  ai_confidence?: number;
}

export interface AuditLogEntry {
  id: string;
  event_code: string;
  actor_id: string | null;
  actor_type: string;
  resource_type: string | null;
  resource_id: string | null;
  action: string;
  payload_json: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  prev_hash: string | null;
  row_hash: string;
  ai_confidence: number | null;
  created_at: Date;
}

export interface ChainVerificationResult {
  valid: boolean;
  broken_at?: string;
}

export interface AuditQueryFilters {
  event_code?: string;
  actor_id?: string;
  resource_type?: string;
  from_date?: Date;
  to_date?: Date;
  page?: number;
  limit?: number;
}

export interface PaginatedAuditLogs {
  data: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
}

// ---------------------------------------------------------------
// Genesis hash -- anchor for the very first entry
// ---------------------------------------------------------------

const GENESIS_HASH =
  '0000000000000000000000000000000000000000000000000000000000000000';

// ---------------------------------------------------------------
// Service
// ---------------------------------------------------------------

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Emit (append) an audit log entry with hash-chain integrity.
   */
  async emit(event: AuditEvent): Promise<AuditLogEntry> {
    const prevHash = await this.getLastHash();
    const createdAt = new Date();
    const id = randomUUID();

    const rowHash = this.computeRowHash(
      prevHash,
      event.event_code,
      event.actor_id ?? '',
      event.resource_type ?? '',
      event.resource_id ?? '',
      event.action,
      createdAt.toISOString(),
    );

    const entry: AuditLogEntry = {
      id,
      event_code: event.event_code,
      actor_id: event.actor_id ?? null,
      actor_type: event.actor_type ?? 'SYSTEM',
      resource_type: event.resource_type ?? null,
      resource_id: event.resource_id ?? null,
      action: event.action,
      payload_json: event.payload_json ?? null,
      ip_address: event.ip_address ?? null,
      user_agent: event.user_agent ?? null,
      prev_hash: prevHash === GENESIS_HASH ? null : prevHash,
      row_hash: rowHash,
      ai_confidence: event.ai_confidence ?? null,
      created_at: createdAt,
    };

    await this.prisma.auditLog.create({
      data: {
        id: entry.id,
        event_code: entry.event_code,
        actor_id: entry.actor_id,
        actor_type: entry.actor_type,
        resource_type: entry.resource_type,
        resource_id: entry.resource_id,
        action: entry.action,
        payload_json: toJsonValue(entry.payload_json),
        ip_address: entry.ip_address,
        user_agent: entry.user_agent,
        prev_hash: entry.prev_hash,
        row_hash: entry.row_hash,
        ai_confidence: entry.ai_confidence,
        created_at: entry.created_at,
      },
    });

    this.logger.debug(
      `Audit entry emitted: ${event.event_code} -> ${event.action} [${id}]`,
    );

    return entry;
  }

  /**
   * Return the hash of the most recent entry, or the genesis hash.
   */
  async getLastHash(): Promise<string> {
    const last = await this.prisma.auditLog.findFirst({
      orderBy: { created_at: 'desc' },
      select: { row_hash: true },
    });

    return last?.row_hash ?? GENESIS_HASH;
  }

  /**
   * Verify the integrity of the hash chain.
   */
  async verifyChain(
    fromId?: string,
    toId?: string,
  ): Promise<ChainVerificationResult> {
    const allLogs = await this.prisma.auditLog.findMany({
      orderBy: { created_at: 'asc' },
      select: { id: true, event_code: true, actor_id: true, resource_type: true, resource_id: true, action: true, prev_hash: true, row_hash: true, created_at: true },
    });

    if (allLogs.length === 0) {
      return { valid: true };
    }

    const fromIndex = fromId
      ? allLogs.findIndex((e) => e.id === fromId)
      : 0;
    const toIndex = toId
      ? allLogs.findIndex((e) => e.id === toId)
      : allLogs.length - 1;

    if (fromIndex < 0 || toIndex < 0 || fromIndex > toIndex) {
      return { valid: true };
    }

    for (let i = fromIndex; i <= toIndex; i++) {
      const entry = allLogs[i];

      const expectedPrevHash =
        i === 0 ? GENESIS_HASH : allLogs[i - 1].row_hash;

      const actualPrevHash =
        entry.prev_hash === null ? GENESIS_HASH : entry.prev_hash;

      if (actualPrevHash !== expectedPrevHash) {
        return { valid: false, broken_at: entry.id };
      }

      const expectedRowHash = this.computeRowHash(
        expectedPrevHash,
        entry.event_code,
        entry.actor_id ?? '',
        entry.resource_type ?? '',
        entry.resource_id ?? '',
        entry.action,
        entry.created_at.toISOString(),
      );

      if (entry.row_hash !== expectedRowHash) {
        return { valid: false, broken_at: entry.id };
      }
    }

    return { valid: true };
  }

  /**
   * Query audit logs with optional filters, paginated.
   */
  async query(filters: AuditQueryFilters = {}): Promise<PaginatedAuditLogs> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (filters.event_code) where.event_code = filters.event_code;
    if (filters.actor_id) where.actor_id = filters.actor_id;
    if (filters.resource_type) where.resource_type = filters.resource_type;
    if (filters.from_date || filters.to_date) {
      where.created_at = {
        ...(filters.from_date && { gte: filters.from_date }),
        ...(filters.to_date && { lte: filters.to_date }),
      };
    }

    const [results, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { created_at: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const data: AuditLogEntry[] = results.map((e) => ({
      id: e.id,
      event_code: e.event_code,
      actor_id: e.actor_id,
      actor_type: e.actor_type,
      resource_type: e.resource_type,
      resource_id: e.resource_id,
      action: e.action,
      payload_json: e.payload_json as Record<string, unknown> | null,
      ip_address: e.ip_address,
      user_agent: e.user_agent,
      prev_hash: e.prev_hash,
      row_hash: e.row_hash,
      ai_confidence: e.ai_confidence,
      created_at: e.created_at,
    }));

    return { data, total, page, limit };
  }

  /**
   * Expose the raw store for testing / evidence-pack generation.
   */
  async getAll(limit = 1000): Promise<AuditLogEntry[]> {
    const logs = await this.prisma.auditLog.findMany({
      orderBy: { created_at: 'asc' },
      take: limit,
    });

    return logs.map((e) => ({
      id: e.id,
      event_code: e.event_code,
      actor_id: e.actor_id,
      actor_type: e.actor_type,
      resource_type: e.resource_type,
      resource_id: e.resource_id,
      action: e.action,
      payload_json: e.payload_json as Record<string, unknown> | null,
      ip_address: e.ip_address,
      user_agent: e.user_agent,
      prev_hash: e.prev_hash,
      row_hash: e.row_hash,
      ai_confidence: e.ai_confidence,
      created_at: e.created_at,
    }));
  }

  // --------- Retention Enforcement (FR-126.A2) ---------

  /**
   * Enforce the 7-year (configurable) audit log retention policy.
   *
   * Runs weekly via cron. Records older than the retention period are
   * archived (flagged) — they are NEVER deleted because audit logs must
   * be retained for at least 7 years per regulatory requirements.
   */
  @Cron(CronExpression.EVERY_WEEK)
  async enforceRetention(): Promise<{ archived: number }> {
    const retentionYears = parseInt(
      process.env.AUDIT_RETENTION_YEARS ?? '7',
      10,
    );

    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - retentionYears);

    this.logger.log(
      `Running retention enforcement: archiving records older than ${retentionYears} years (before ${cutoffDate.toISOString()})`,
    );

    // Archive (flag) records older than the retention period by setting
    // a payload marker. We never delete audit log records.
    const result = await this.prisma.auditLog.updateMany({
      where: {
        created_at: { lt: cutoffDate },
        // Only archive records not already archived
        NOT: {
          action: 'ARCHIVED',
        },
      },
      data: {
        action: 'ARCHIVED',
      },
    });

    if (result.count > 0) {
      this.logger.log(
        `Retention enforcement: archived ${result.count} audit records older than ${retentionYears} years.`,
      );

      // Emit an audit event recording the archival action
      await this.emit({
        event_code: 'AUDIT_RETENTION_ENFORCED',
        actor_type: 'SYSTEM',
        resource_type: 'AuditLog',
        action: 'ARCHIVE',
        payload_json: {
          archived_count: result.count,
          retention_years: retentionYears,
          cutoff_date: cutoffDate.toISOString(),
        },
      });
    } else {
      this.logger.debug('Retention enforcement: no records require archiving.');
    }

    return { archived: result.count };
  }

  /**
   * Prevent deletion of audit logs younger than the retention period.
   * This guard should be called before any deletion attempt to ensure
   * regulatory compliance.
   */
  assertDeletionAllowed(recordDate: Date): void {
    const retentionYears = parseInt(
      process.env.AUDIT_RETENTION_YEARS ?? '7',
      10,
    );

    const cutoffDate = new Date();
    cutoffDate.setFullYear(cutoffDate.getFullYear() - retentionYears);

    if (recordDate >= cutoffDate) {
      const message = `Deletion denied: audit log record dated ${recordDate.toISOString()} is within the ${retentionYears}-year retention period. Audit logs must not be deleted before ${cutoffDate.toISOString()}.`;
      this.logger.error(message);
      throw new Error(message);
    }
  }

  // --------- Internals ---------

  private computeRowHash(
    prevHash: string,
    eventCode: string,
    actorId: string,
    resourceType: string,
    resourceId: string,
    action: string,
    timestamp: string,
  ): string {
    const input = [
      prevHash,
      eventCode,
      actorId,
      resourceType,
      resourceId,
      action,
      timestamp,
    ].join('|');

    return createHash('sha256').update(input).digest('hex');
  }
}
