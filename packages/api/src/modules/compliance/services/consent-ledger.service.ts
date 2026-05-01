import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../common/prisma';

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

export type ConsentStatus = 'GRANTED' | 'REVOKED' | 'EXPIRED';

export interface ConsentEntry {
  id: string;
  data_subject_id: string;
  purpose_code: string;
  status: ConsentStatus;
  source: string;
  granted_at: Date;
  revoked_at: Date | null;
  expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

// ---------------------------------------------------------------
// Service
// ---------------------------------------------------------------

@Injectable()
export class ConsentLedgerService {
  private readonly logger = new Logger(ConsentLedgerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record that consent has been granted.
   */
  async recordConsent(
    dataSubjectId: string,
    purposeCode: string,
    source: string,
  ): Promise<ConsentEntry> {
    const now = new Date();

    const record = await this.prisma.consentLedger.create({
      data: {
        data_subject_id: dataSubjectId,
        purpose_code: purposeCode,
        status: 'GRANTED',
        source,
        granted_at: now,
      },
    });

    this.logger.debug(
      `Consent granted: subject=${dataSubjectId}, purpose=${purposeCode}`,
    );

    return {
      id: record.id,
      data_subject_id: record.data_subject_id,
      purpose_code: record.purpose_code,
      status: record.status as ConsentStatus,
      source: record.source,
      granted_at: record.granted_at,
      revoked_at: record.revoked_at,
      expires_at: record.expires_at,
      created_at: record.created_at,
      updated_at: record.updated_at,
    };
  }

  /**
   * Revoke a previously granted consent for a specific purpose.
   */
  async revokeConsent(
    dataSubjectId: string,
    purposeCode: string,
  ): Promise<ConsentEntry | null> {
    const entry = await this.prisma.consentLedger.findFirst({
      where: {
        data_subject_id: dataSubjectId,
        purpose_code: purposeCode,
        status: 'GRANTED',
      },
    });

    if (!entry) {
      return null;
    }

    const now = new Date();
    const updated = await this.prisma.consentLedger.update({
      where: { id: entry.id },
      data: {
        status: 'REVOKED',
        revoked_at: now,
      },
    });

    this.logger.debug(
      `Consent revoked: subject=${dataSubjectId}, purpose=${purposeCode}`,
    );

    return {
      id: updated.id,
      data_subject_id: updated.data_subject_id,
      purpose_code: updated.purpose_code,
      status: updated.status as ConsentStatus,
      source: updated.source,
      granted_at: updated.granted_at,
      revoked_at: updated.revoked_at,
      expires_at: updated.expires_at,
      created_at: updated.created_at,
      updated_at: updated.updated_at,
    };
  }

  /**
   * Check the current consent status for a subject + purpose pair.
   */
  async checkConsent(
    dataSubjectId: string,
    purposeCode: string,
  ): Promise<ConsentEntry | null> {
    const entry = await this.prisma.consentLedger.findFirst({
      where: {
        data_subject_id: dataSubjectId,
        purpose_code: purposeCode,
      },
      orderBy: { updated_at: 'desc' },
    });

    if (!entry) return null;

    return {
      id: entry.id,
      data_subject_id: entry.data_subject_id,
      purpose_code: entry.purpose_code,
      status: entry.status as ConsentStatus,
      source: entry.source,
      granted_at: entry.granted_at,
      revoked_at: entry.revoked_at,
      expires_at: entry.expires_at,
      created_at: entry.created_at,
      updated_at: entry.updated_at,
    };
  }

  /**
   * Get all consent entries within a date range.
   */
  async getConsentsInRange(from: Date, to: Date): Promise<ConsentEntry[]> {
    const entries = await this.prisma.consentLedger.findMany({
      where: {
        created_at: {
          gte: from,
          lte: to,
        },
      },
      orderBy: { created_at: 'asc' },
    });

    return entries.map((e) => ({
      id: e.id,
      data_subject_id: e.data_subject_id,
      purpose_code: e.purpose_code,
      status: e.status as ConsentStatus,
      source: e.source,
      granted_at: e.granted_at,
      revoked_at: e.revoked_at,
      expires_at: e.expires_at,
      created_at: e.created_at,
      updated_at: e.updated_at,
    }));
  }

  /**
   * Get all consent entries for a data subject.
   */
  async getConsentsForSubject(dataSubjectId: string): Promise<ConsentEntry[]> {
    const entries = await this.prisma.consentLedger.findMany({
      where: { data_subject_id: dataSubjectId },
      orderBy: { created_at: 'asc' },
    });

    return entries.map((e) => ({
      id: e.id,
      data_subject_id: e.data_subject_id,
      purpose_code: e.purpose_code,
      status: e.status as ConsentStatus,
      source: e.source,
      granted_at: e.granted_at,
      revoked_at: e.revoked_at,
      expires_at: e.expires_at,
      created_at: e.created_at,
      updated_at: e.updated_at,
    }));
  }
}
