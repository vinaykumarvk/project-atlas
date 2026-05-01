import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AutoAckService } from '../services/auto-ack.service';
import { PrismaService } from '../../../common/prisma';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';

describe('AutoAckService — DKIM Header Generation (FR-144.A1)', () => {
  let service: AutoAckService;

  beforeEach(async () => {
    const mockPrisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AutoAckService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('') },
        },
      ],
    }).compile();

    service = module.get<AutoAckService>(AutoAckService);
  });

  describe('generateDkimHeader', () => {
    it('should return a properly formatted DKIM-Signature header', () => {
      const header = service.generateDkimHeader(
        'atlas.bank.internal',
        'default',
        'dGVzdGJvZHloYXNo',
      );

      expect(header).toContain('DKIM-Signature:');
      expect(header).toContain('v=1');
      expect(header).toContain('a=rsa-sha256');
      expect(header).toContain('d=atlas.bank.internal');
      expect(header).toContain('s=default');
      expect(header).toContain('bh=dGVzdGJvZHloYXNo');
      expect(header).toContain('b=');
    });

    it('should include relaxed/relaxed canonicalization', () => {
      const header = service.generateDkimHeader(
        'example.com',
        'sel1',
        'hash123',
      );

      expect(header).toContain('c=relaxed/relaxed');
    });

    it('should include signed headers list', () => {
      const header = service.generateDkimHeader(
        'example.com',
        'sel1',
        'hash123',
      );

      expect(header).toContain('h=from:to:subject:date:mime-version');
    });

    it('should include a timestamp (t= tag)', () => {
      const header = service.generateDkimHeader(
        'example.com',
        'sel1',
        'hash123',
      );

      const tMatch = header.match(/t=(\d+)/);
      expect(tMatch).not.toBeNull();

      const timestamp = parseInt(tMatch![1], 10);
      const nowSeconds = Math.floor(Date.now() / 1000);
      // Timestamp should be within 5 seconds of now
      expect(Math.abs(timestamp - nowSeconds)).toBeLessThan(5);
    });

    it('should produce a non-empty base64 signature in b= tag', () => {
      const header = service.generateDkimHeader(
        'atlas.bank.internal',
        'default',
        'bodyHash',
      );

      const bMatch = header.match(/b=([A-Za-z0-9+/=]+)$/);
      expect(bMatch).not.toBeNull();
      expect(bMatch![1].length).toBeGreaterThan(0);
    });

    it('should produce different signatures for different domains', () => {
      const header1 = service.generateDkimHeader('domain-a.com', 'sel', 'hash');
      const header2 = service.generateDkimHeader('domain-b.com', 'sel', 'hash');

      const sig1 = header1.match(/b=([A-Za-z0-9+/=]+)$/)?.[1];
      const sig2 = header2.match(/b=([A-Za-z0-9+/=]+)$/)?.[1];
      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signatures for different selectors', () => {
      const header1 = service.generateDkimHeader('example.com', 'sel-a', 'hash');
      const header2 = service.generateDkimHeader('example.com', 'sel-b', 'hash');

      const sig1 = header1.match(/b=([A-Za-z0-9+/=]+)$/)?.[1];
      const sig2 = header2.match(/b=([A-Za-z0-9+/=]+)$/)?.[1];
      expect(sig1).not.toBe(sig2);
    });

    it('should produce different signatures for different body hashes', () => {
      const header1 = service.generateDkimHeader('example.com', 'sel', 'hash-a');
      const header2 = service.generateDkimHeader('example.com', 'sel', 'hash-b');

      const sig1 = header1.match(/b=([A-Za-z0-9+/=]+)$/)?.[1];
      const sig2 = header2.match(/b=([A-Za-z0-9+/=]+)$/)?.[1];
      expect(sig1).not.toBe(sig2);
    });

    it('should use the domain and selector in the header', () => {
      const header = service.generateDkimHeader(
        'my-bank.co.in',
        'mail2024',
        'aGFzaA==',
      );

      expect(header).toContain('d=my-bank.co.in');
      expect(header).toContain('s=mail2024');
    });
  });
});
