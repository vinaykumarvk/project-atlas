import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ComplianceController } from '../controllers/compliance.controller';
import { AuditLogService } from '../../audit/services/audit-log.service';
import { ConsentLedgerService } from '../services/consent-ledger.service';
import { DsrService } from '../services/dsr.service';
import { CrossBorderApprovalService } from '../services/cross-border-approval.service';
import { MakerCheckerService } from '../../masters/services/maker-checker.service';
import { RegulatoryEvidenceService } from '../services/regulatory-evidence.service';
import { ConfigService } from '@nestjs/config';
import { AuthModeConfig } from '../../auth/config/auth-mode.config';

describe('ComplianceController — getRbiAuditPack (FR-114.A2)', () => {
  let controller: ComplianceController;
  let mockAuditLogService: Record<string, jest.Mock>;
  let mockConsentLedgerService: Record<string, jest.Mock>;
  let mockDsrService: Record<string, jest.Mock>;
  let mockCrossBorderService: Record<string, jest.Mock>;
  let mockMakerCheckerService: Record<string, jest.Mock>;

  beforeEach(async () => {
    mockAuditLogService = {
      query: jest.fn().mockResolvedValue({ data: [], total: 0 }),
      verifyChain: jest.fn().mockResolvedValue({ valid: true }),
      emit: jest.fn().mockResolvedValue({}),
    };

    mockConsentLedgerService = {
      getConsentsForSubject: jest.fn().mockResolvedValue([]),
      getConsentsInRange: jest.fn().mockResolvedValue([]),
    };

    mockDsrService = {
      submitAccessRequest: jest.fn(),
      getRequests: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 100000 }),
      completeRequest: jest.fn(),
    };

    mockCrossBorderService = {
      createApproval: jest.fn(),
      listApprovals: jest.fn().mockReturnValue([]),
      hasValidApproval: jest.fn(),
    };

    mockMakerCheckerService = {
      getAll: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ComplianceController],
      providers: [
        { provide: AuditLogService, useValue: mockAuditLogService },
        { provide: ConsentLedgerService, useValue: mockConsentLedgerService },
        { provide: DsrService, useValue: mockDsrService },
        { provide: CrossBorderApprovalService, useValue: mockCrossBorderService },
        { provide: MakerCheckerService, useValue: mockMakerCheckerService },
        { provide: RegulatoryEvidenceService, useValue: { generateRegulatoryEvidence: jest.fn().mockResolvedValue({}) } },
        { provide: AuthModeConfig, useValue: { isMfaEnabled: () => false } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('50') } },
        Reflector,
      ],
    }).compile();

    controller = module.get(ComplianceController);
  });

  it('should return the audit pack with all required sections', async () => {
    const result = await controller.getRbiAuditPack();

    expect(result).toHaveProperty('generatedAt');
    expect(result.sections).toHaveProperty('dsrSummary');
    expect(result.sections).toHaveProperty('consentStats');
    expect(result.sections).toHaveProperty('breachReport');
    expect(result.sections).toHaveProperty('dataResidencyStatus');
  });

  it('should aggregate DSR data by status', async () => {
    mockDsrService.getRequests.mockResolvedValue({
      data: [
        { id: '1', status: 'PENDING', type: 'ACCESS', created_at: new Date(), updated_at: new Date(), completed_at: null },
        { id: '2', status: 'COMPLETED', type: 'ERASURE', created_at: new Date(), updated_at: new Date(), completed_at: new Date() },
        { id: '3', status: 'PENDING', type: 'RECTIFICATION', created_at: new Date(), updated_at: new Date(), completed_at: null },
      ],
      total: 3,
      page: 1,
      limit: 100000,
    });

    const result = await controller.getRbiAuditPack();

    expect(result.sections.dsrSummary.totalRequests).toBe(3);
    expect(result.sections.dsrSummary.byStatus.PENDING).toBe(2);
    expect(result.sections.dsrSummary.byStatus.COMPLETED).toBe(1);
  });

  it('should include consent statistics', async () => {
    mockConsentLedgerService.getConsentsInRange.mockResolvedValue([
      { id: 'c1', purpose: 'marketing', status: 'GRANTED' },
      { id: 'c2', purpose: 'analytics', status: 'GRANTED' },
      { id: 'c3', purpose: 'marketing', status: 'REVOKED' },
    ]);

    const result = await controller.getRbiAuditPack();

    expect(result.sections.consentStats.totalRecords).toBe(3);
    expect(result.sections.consentStats.byPurpose.marketing).toBe(2);
    expect(result.sections.consentStats.byPurpose.analytics).toBe(1);
  });

  it('should include breach report data', async () => {
    mockAuditLogService.query.mockResolvedValue({
      data: [{ event_code: 'DATA_BREACH', id: 'breach-1' }],
      total: 1,
    });

    const result = await controller.getRbiAuditPack();

    expect(result.sections.breachReport.totalBreachEvents).toBe(1);
  });

  it('should include data residency status', async () => {
    const futureDate = new Date(Date.now() + 86400000);
    mockCrossBorderService.listApprovals.mockReturnValue([
      {
        id: 'cba-1',
        sourceRegion: 'NORTH',
        targetRegion: 'SOUTH',
        expiresAt: futureDate,
      },
      {
        id: 'cba-2',
        sourceRegion: 'NORTH',
        targetRegion: 'WEST',
        expiresAt: new Date(0), // expired
      },
    ]);

    const result = await controller.getRbiAuditPack();

    expect(result.sections.dataResidencyStatus.activeCrossBorderApprovals).toBe(1);
  });

  it('should set generatedAt to a valid ISO timestamp', async () => {
    const result = await controller.getRbiAuditPack();

    const parsedDate = new Date(result.generatedAt);
    expect(parsedDate.toISOString()).toBe(result.generatedAt);
  });
});
