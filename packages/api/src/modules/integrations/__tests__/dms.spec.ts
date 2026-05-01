import { Test, TestingModule } from '@nestjs/testing';
import { DmsService, DmsProvider, MockDmsProvider } from '../services/dms.service';

describe('DmsService (FR-024.A1)', () => {
  let service: DmsService;
  let mockProvider: MockDmsProvider;

  beforeEach(async () => {
    mockProvider = new MockDmsProvider();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DmsService,
        { provide: 'DmsProvider', useValue: mockProvider },
      ],
    }).compile();

    service = module.get<DmsService>(DmsService);
  });

  describe('uploadDocument', () => {
    it('should upload a document and return an external ID', async () => {
      const content = Buffer.from('PDF content here');
      const result = await service.uploadDocument(
        'case-001',
        'valuation-report.pdf',
        content,
      );

      expect(result.dmsExternalId).toBeDefined();
      expect(typeof result.dmsExternalId).toBe('string');
      expect(result.dmsExternalId.length).toBeGreaterThan(0);
    });

    it('should store document with correct metadata', async () => {
      const content = Buffer.from('Document content');
      const result = await service.uploadDocument(
        'case-002',
        'title-deed.pdf',
        content,
      );

      // Verify by fetching it back
      const fetched = await service.fetchDocument(result.dmsExternalId);
      expect(fetched).not.toBeNull();
      expect(fetched!.metadata.caseId).toBe('case-002');
      expect(fetched!.metadata.filename).toBe('title-deed.pdf');
      expect(fetched!.metadata.uploadedAt).toBeDefined();
      expect(fetched!.metadata.sizeBytes).toBe(
        content.length.toString(),
      );
    });

    it('should store the actual file content', async () => {
      const content = Buffer.from('Important document content for verification');
      const result = await service.uploadDocument(
        'case-003',
        'test.txt',
        content,
      );

      const fetched = await service.fetchDocument(result.dmsExternalId);
      expect(fetched).not.toBeNull();
      expect(fetched!.content.toString()).toBe(
        'Important document content for verification',
      );
    });

    it('should generate unique external IDs for each upload', async () => {
      const content = Buffer.from('content');
      const result1 = await service.uploadDocument('case-1', 'file1.pdf', content);
      const result2 = await service.uploadDocument('case-2', 'file2.pdf', content);

      expect(result1.dmsExternalId).not.toBe(result2.dmsExternalId);
    });

    it('should propagate errors from the provider', async () => {
      const errorProvider: DmsProvider = {
        upload: jest.fn().mockRejectedValue(new Error('Storage full')),
        fetch: jest.fn(),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DmsService,
          { provide: 'DmsProvider', useValue: errorProvider },
        ],
      }).compile();

      const errorService = module.get<DmsService>(DmsService);
      await expect(
        errorService.uploadDocument('case-1', 'file.pdf', Buffer.from('x')),
      ).rejects.toThrow('Storage full');
    });
  });

  describe('fetchDocument', () => {
    it('should fetch an uploaded document by external ID', async () => {
      const content = Buffer.from('Fetch test content');
      const { dmsExternalId } = await service.uploadDocument(
        'case-010',
        'report.pdf',
        content,
      );

      const result = await service.fetchDocument(dmsExternalId);

      expect(result).not.toBeNull();
      expect(result!.content.toString()).toBe('Fetch test content');
      expect(result!.metadata.caseId).toBe('case-010');
    });

    it('should return null for a non-existent external ID', async () => {
      const result = await service.fetchDocument('non-existent-id');
      expect(result).toBeNull();
    });

    it('should propagate errors from the provider', async () => {
      const errorProvider: DmsProvider = {
        upload: jest.fn(),
        fetch: jest.fn().mockRejectedValue(new Error('DMS unavailable')),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          DmsService,
          { provide: 'DmsProvider', useValue: errorProvider },
        ],
      }).compile();

      const errorService = module.get<DmsService>(DmsService);
      await expect(
        errorService.fetchDocument('some-id'),
      ).rejects.toThrow('DMS unavailable');
    });
  });

  describe('MockDmsProvider', () => {
    it('should track document count', async () => {
      expect(mockProvider.getDocumentCount()).toBe(0);

      await mockProvider.upload('file1.pdf', Buffer.from('a'), {});
      await mockProvider.upload('file2.pdf', Buffer.from('b'), {});

      expect(mockProvider.getDocumentCount()).toBe(2);
    });

    it('should store and retrieve with metadata', async () => {
      const metadata = { source: 'email', priority: 'high' };
      const id = await mockProvider.upload(
        'test.pdf',
        Buffer.from('content'),
        metadata,
      );

      const result = await mockProvider.fetch(id);
      expect(result).not.toBeNull();
      expect(result!.metadata).toEqual(metadata);
    });
  });
});
