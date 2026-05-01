import { ManifestVerificationService } from '../services/manifest-verification.service';

describe('ManifestVerificationService', () => {
  let service: ManifestVerificationService;

  beforeEach(() => {
    service = new ManifestVerificationService();
  });

  describe('computeChecksum', () => {
    it('should return a SHA-256 hex string', () => {
      const checksum = service.computeChecksum('hello');
      expect(checksum).toHaveLength(64);
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should return consistent checksums for same input', () => {
      const a = service.computeChecksum('test-data');
      const b = service.computeChecksum('test-data');
      expect(a).toBe(b);
    });

    it('should return different checksums for different input', () => {
      const a = service.computeChecksum('data-a');
      const b = service.computeChecksum('data-b');
      expect(a).not.toBe(b);
    });
  });

  describe('verifyManifest', () => {
    it('should validate a correct manifest', () => {
      const services = ['api', 'web'];
      const version = '1.0.0';
      const checksum = service.computeChecksum(
        JSON.stringify({ version, services }),
      );

      const result = service.verifyManifest({ version, checksum, services });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject manifest with missing version', () => {
      const result = service.verifyManifest({
        version: '',
        checksum: 'abc',
        services: ['api'],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing or invalid version');
    });

    it('should reject manifest with missing checksum', () => {
      const result = service.verifyManifest({
        version: '1.0.0',
        checksum: '',
        services: ['api'],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing or invalid checksum');
    });

    it('should reject manifest with empty services', () => {
      const result = service.verifyManifest({
        version: '1.0.0',
        checksum: 'abc',
        services: [],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing or empty services array');
    });

    it('should reject manifest with wrong checksum', () => {
      const result = service.verifyManifest({
        version: '1.0.0',
        checksum: 'deadbeef'.repeat(8),
        services: ['api'],
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Checksum mismatch');
    });
  });

  describe('compareManifests', () => {
    it('should return empty diffs for identical manifests', () => {
      const manifest = {
        version: '1.0.0',
        checksum: 'abc',
        services: ['api', 'web'],
      };
      const result = service.compareManifests(manifest, manifest);
      expect(result.diffs).toHaveLength(0);
    });

    it('should detect version differences', () => {
      const staging = {
        version: '1.1.0',
        checksum: 'abc',
        services: ['api'],
      };
      const production = {
        version: '1.0.0',
        checksum: 'abc',
        services: ['api'],
      };
      const result = service.compareManifests(staging, production);
      expect(result.diffs).toContainEqual(
        expect.stringContaining('Version differs'),
      );
    });

    it('should detect checksum differences', () => {
      const staging = {
        version: '1.0.0',
        checksum: 'abc',
        services: ['api'],
      };
      const production = {
        version: '1.0.0',
        checksum: 'xyz',
        services: ['api'],
      };
      const result = service.compareManifests(staging, production);
      expect(result.diffs).toContainEqual(
        expect.stringContaining('Checksum differs'),
      );
    });

    it('should detect services only in staging', () => {
      const staging = {
        version: '1.0.0',
        checksum: 'abc',
        services: ['api', 'web', 'worker'],
      };
      const production = {
        version: '1.0.0',
        checksum: 'abc',
        services: ['api', 'web'],
      };
      const result = service.compareManifests(staging, production);
      expect(result.diffs).toContainEqual(
        expect.stringContaining('"worker" exists in staging'),
      );
    });

    it('should detect services only in production', () => {
      const staging = {
        version: '1.0.0',
        checksum: 'abc',
        services: ['api'],
      };
      const production = {
        version: '1.0.0',
        checksum: 'abc',
        services: ['api', 'legacy'],
      };
      const result = service.compareManifests(staging, production);
      expect(result.diffs).toContainEqual(
        expect.stringContaining('"legacy" exists in production'),
      );
    });
  });
});
