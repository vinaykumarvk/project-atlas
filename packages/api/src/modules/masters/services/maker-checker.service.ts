import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService, toJsonValue } from '../../../common/prisma';
import { randomUUID } from 'crypto';
import { WebhookDispatcherService } from '../../webhooks/services/webhook-dispatcher.service';

/**
 * Status of a master change log entry.
 */
export enum ChangeStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

/**
 * Action types for master data changes.
 */
export enum ChangeAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

/**
 * Represents a master data change log entry.
 */
export interface MasterChangeLogEntry {
  id: string;
  master_table: string;
  record_id: string | null;
  action: ChangeAction;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  status: ChangeStatus;
  rejection_reason: string | null;
  maker_id: string;
  checker_id: string | null;
  submitted_at: Date;
  reviewed_at: Date | null;
  effective_at: Date | null;
  is_batch: boolean;
  batch_id: string | null;
}

/**
 * Maker-Checker workflow engine.
 *
 * Implements the four-eyes principle for master data changes:
 * one user proposes (maker) and a different user approves/rejects (checker).
 */
@Injectable()
export class MakerCheckerService {
  private readonly logger = new Logger(MakerCheckerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly webhookDispatcher: WebhookDispatcherService,
  ) {}

  /**
   * Get all change logs (for querying), bounded.
   */
  async getAll(limit = 500): Promise<MasterChangeLogEntry[]> {
    const logs = await this.prisma.masterChangeLog.findMany({
      orderBy: { submitted_at: 'desc' },
      take: limit,
    });
    return logs.map((l) => this.mapToEntry(l));
  }

  /**
   * Get change logs filtered by status.
   */
  async getByStatus(status: ChangeStatus, limit = 500): Promise<MasterChangeLogEntry[]> {
    const logs = await this.prisma.masterChangeLog.findMany({
      where: { status },
      orderBy: { submitted_at: 'desc' },
      take: limit,
    });
    return logs.map((l) => this.mapToEntry(l));
  }

  /**
   * Get a single change log entry by ID.
   */
  async getById(changeId: string): Promise<MasterChangeLogEntry | undefined> {
    const log = await this.prisma.masterChangeLog.findUnique({
      where: { id: changeId },
    });
    return log ? this.mapToEntry(log) : undefined;
  }

  /**
   * Propose a change to a master data record.
   */
  async proposeChange(
    masterTable: string,
    recordId: string | null,
    action: ChangeAction,
    afterData: Record<string, unknown> | null,
    makerId: string,
    options?: {
      beforeData?: Record<string, unknown> | null;
      effectiveAt?: Date | null;
      isBatch?: boolean;
      batchId?: string | null;
    },
  ): Promise<MasterChangeLogEntry> {
    const id = randomUUID();

    const record = await this.prisma.masterChangeLog.create({
      data: {
        id,
        master_table: masterTable,
        record_id: recordId,
        action,
        before_json: toJsonValue(options?.beforeData),
        after_json: toJsonValue(afterData),
        status: ChangeStatus.PENDING,
        maker_id: makerId,
        effective_at: options?.effectiveAt ?? null,
        is_batch: options?.isBatch ?? false,
        batch_id: options?.batchId ?? null,
      },
    });

    return this.mapToEntry(record);
  }

  /**
   * Approve a pending change.
   */
  async approveChange(changeId: string, checkerId: string): Promise<MasterChangeLogEntry> {
    const entry = await this.prisma.masterChangeLog.findUnique({
      where: { id: changeId },
    });

    if (!entry) {
      throw new NotFoundException(`Change ${changeId} not found`);
    }

    if (entry.status !== ChangeStatus.PENDING) {
      throw new BadRequestException(
        `Change ${changeId} is not in PENDING status (current: ${entry.status})`,
      );
    }

    if (entry.maker_id === checkerId) {
      throw new BadRequestException(
        'Self-approval is not allowed: checker cannot be the same as maker',
      );
    }

    const updated = await this.prisma.masterChangeLog.update({
      where: { id: changeId },
      data: {
        status: ChangeStatus.APPROVED,
        checker_id: checkerId,
        reviewed_at: new Date(),
      },
    });

    // FR-141.A1: Dispatch master.updated webhook event after approval (fire-and-forget)
    try {
      this.webhookDispatcher.dispatch('master.updated', {
        changeId: updated.id,
        masterTable: updated.master_table,
        recordId: updated.record_id,
        action: updated.action,
        makerId: updated.maker_id,
        checkerId,
        status: ChangeStatus.APPROVED,
        approvedAt: new Date().toISOString(),
      });
    } catch (err) {
      this.logger.error(`Webhook dispatch failed for master.updated ${changeId}: ${(err as Error).message}`);
    }

    return this.mapToEntry(updated);
  }

  /**
   * Reject a pending change with a reason.
   */
  async rejectChange(
    changeId: string,
    checkerId: string,
    reason: string,
  ): Promise<MasterChangeLogEntry> {
    const entry = await this.prisma.masterChangeLog.findUnique({
      where: { id: changeId },
    });

    if (!entry) {
      throw new NotFoundException(`Change ${changeId} not found`);
    }

    if (entry.status !== ChangeStatus.PENDING) {
      throw new BadRequestException(
        `Change ${changeId} is not in PENDING status (current: ${entry.status})`,
      );
    }

    if (entry.maker_id === checkerId) {
      throw new BadRequestException(
        'Self-approval is not allowed: checker cannot be the same as maker',
      );
    }

    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException('Rejection reason is required');
    }

    const updated = await this.prisma.masterChangeLog.update({
      where: { id: changeId },
      data: {
        status: ChangeStatus.REJECTED,
        checker_id: checkerId,
        rejection_reason: reason,
        reviewed_at: new Date(),
      },
    });

    return this.mapToEntry(updated);
  }

  /**
   * Rollback a master data record to its previous version.
   */
  async rollback(
    masterTable: string,
    recordId: string,
    userId: string,
  ): Promise<MasterChangeLogEntry> {
    const approvedChanges = await this.prisma.masterChangeLog.findMany({
      where: {
        master_table: masterTable,
        record_id: recordId,
        status: ChangeStatus.APPROVED,
      },
      orderBy: [{ reviewed_at: 'desc' }, { submitted_at: 'desc' }],
    });

    if (approvedChanges.length === 0) {
      throw new NotFoundException(
        `No approved changes found for ${masterTable}/${recordId} to rollback`,
      );
    }

    const lastApproved = approvedChanges[0];

    const revertData = lastApproved.before_json as Record<string, unknown> | null;
    const currentData = lastApproved.after_json as Record<string, unknown> | null;

    return this.proposeChange(
      masterTable,
      recordId,
      ChangeAction.UPDATE,
      revertData,
      userId,
      { beforeData: currentData },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapToEntry(l: any): MasterChangeLogEntry {
    return {
      id: l.id,
      master_table: l.master_table,
      record_id: l.record_id,
      action: l.action as ChangeAction,
      before_json: l.before_json as Record<string, unknown> | null,
      after_json: l.after_json as Record<string, unknown> | null,
      status: l.status as ChangeStatus,
      rejection_reason: l.rejection_reason,
      maker_id: l.maker_id,
      checker_id: l.checker_id,
      submitted_at: l.submitted_at,
      reviewed_at: l.reviewed_at,
      effective_at: l.effective_at,
      is_batch: l.is_batch,
      batch_id: l.batch_id,
    };
  }
}
