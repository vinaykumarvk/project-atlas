import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

export interface ManifestData {
  version: string;
  checksum: string;
  services: string[];
  [key: string]: unknown;
}

@Injectable()
export class ManifestVerificationService {
  /**
   * Verify a manifest's integrity and required fields.
   */
  verifyManifest(manifest: {
    version: string;
    checksum: string;
    services: string[];
  }): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!manifest.version || typeof manifest.version !== 'string') {
      errors.push('Missing or invalid version');
    }

    if (!manifest.checksum || typeof manifest.checksum !== 'string') {
      errors.push('Missing or invalid checksum');
    }

    if (!Array.isArray(manifest.services) || manifest.services.length === 0) {
      errors.push('Missing or empty services array');
    }

    if (manifest.checksum && manifest.version) {
      const expectedChecksum = this.computeChecksum(
        JSON.stringify({ version: manifest.version, services: manifest.services }),
      );
      if (manifest.checksum !== expectedChecksum) {
        errors.push('Checksum mismatch');
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Compute SHA-256 checksum of a string.
   */
  computeChecksum(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Compare two manifests and return the differences.
   */
  compareManifests(
    staging: ManifestData,
    production: ManifestData,
  ): { diffs: string[] } {
    const diffs: string[] = [];

    if (staging.version !== production.version) {
      diffs.push(
        `Version differs: staging=${staging.version}, production=${production.version}`,
      );
    }

    if (staging.checksum !== production.checksum) {
      diffs.push('Checksum differs');
    }

    const stagingServices = new Set(staging.services || []);
    const prodServices = new Set(production.services || []);

    for (const svc of stagingServices) {
      if (!prodServices.has(svc)) {
        diffs.push(`Service "${svc}" exists in staging but not production`);
      }
    }

    for (const svc of prodServices) {
      if (!stagingServices.has(svc)) {
        diffs.push(`Service "${svc}" exists in production but not staging`);
      }
    }

    return { diffs };
  }
}
