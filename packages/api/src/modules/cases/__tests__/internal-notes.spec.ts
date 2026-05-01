import { Test, TestingModule } from '@nestjs/testing';
import { InternalNotesService } from '../services/internal-notes.service';
import { PrismaService } from '../../../common/prisma';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';
import { AuditLogService } from '../../audit/services/audit-log.service';

describe('InternalNotesService (FR-054.A1-A3)', () => {
  let service: InternalNotesService;
  let prisma: ReturnType<typeof createMockPrismaService>;
  let mockAuditLogService: { emit: jest.Mock };

  beforeEach(async () => {
    prisma = createMockPrismaService();
    mockAuditLogService = { emit: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InternalNotesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get<InternalNotesService>(InternalNotesService);
  });

  describe('parseMentions', () => {
    it('should extract @mentions from content', () => {
      const mentions = service.parseMentions('Hello @john.doe and @jane_smith, please review');
      expect(mentions).toEqual(['john.doe', 'jane_smith']);
    });

    it('should return empty array when no mentions exist', () => {
      const mentions = service.parseMentions('No mentions here');
      expect(mentions).toEqual([]);
    });

    it('should handle multiple consecutive mentions', () => {
      const mentions = service.parseMentions('@alice @bob @charlie');
      expect(mentions).toEqual(['alice', 'bob', 'charlie']);
    });
  });

  describe('addNote', () => {
    it('should create a case activity log entry', async () => {
      (prisma.caseActivityLog.create as jest.Mock).mockResolvedValue({
        id: 'note-1',
        case_id: 'case-1',
        action_code: 'NOTE',
        actor_type: 'USER',
        actor_id: 'user-1',
        payload_json: { details: 'Test note', isPrivate: false, mentions: [] },
      });

      const result = await service.addNote('case-1', 'Test note', false, 'user-1');
      expect(result.id).toBe('note-1');
      expect(result.mentions).toEqual([]);
      expect(prisma.caseActivityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          case_id: 'case-1',
          action_code: 'NOTE',
          actor_id: 'user-1',
        }),
      });
    });

    it('should emit audit log when adding a note', async () => {
      (prisma.caseActivityLog.create as jest.Mock).mockResolvedValue({
        id: 'note-2',
        case_id: 'case-1',
        action_code: 'NOTE',
        actor_id: 'user-1',
      });

      await service.addNote('case-1', 'Audit test', true, 'user-1');
      expect(mockAuditLogService.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          event_code: 'INTERNAL_NOTE_CREATED',
          action: 'CREATE_NOTE',
          resource_type: 'Case',
          resource_id: 'case-1',
        }),
      );
    });

    it('should parse mentions from note content', async () => {
      (prisma.caseActivityLog.create as jest.Mock).mockResolvedValue({
        id: 'note-3',
        case_id: 'case-1',
        action_code: 'NOTE',
        actor_id: 'user-1',
      });

      const result = await service.addNote('case-1', 'Please review @manager', false, 'user-1');
      expect(result.mentions).toEqual(['manager']);
    });
  });

  describe('getNotes', () => {
    it('should return all notes for privileged roles', async () => {
      (prisma.caseActivityLog.findMany as jest.Mock).mockResolvedValue([
        { id: '1', payload_json: { details: 'Public note', isPrivate: false } },
        { id: '2', payload_json: { details: 'Private note', isPrivate: true } },
      ]);

      const notes = await service.getNotes('case-1', 'SYS_ADMIN');
      expect(notes).toHaveLength(2);
    });

    it('should filter private notes for non-privileged roles', async () => {
      (prisma.caseActivityLog.findMany as jest.Mock).mockResolvedValue([
        { id: '1', payload_json: { details: 'Public note', isPrivate: false } },
        { id: '2', payload_json: { details: 'Private note', isPrivate: true } },
      ]);

      const notes = await service.getNotes('case-1', 'VIEWER');
      expect(notes).toHaveLength(1);
      expect((notes[0].payload_json as any).isPrivate).toBe(false);
    });
  });
});
