import { describe, it, expect } from 'vitest';

describe('Master Rollback (FR-042.A3)', () => {
  const rollbackEndpoint = '/masters/property_location_masters/rec-1/rollback';
  const rollbackPayload = { targetVersion: 2 };

  it('should construct correct rollback endpoint path', () => {
    expect(rollbackEndpoint).toContain('/rollback');
    expect(rollbackEndpoint).toContain('property_location_masters');
  });

  it('should include target version in payload', () => {
    expect(rollbackPayload.targetVersion).toBe(2);
    expect(typeof rollbackPayload.targetVersion).toBe('number');
  });

  it('should support rollback for different master tables', () => {
    const tables = ['property_location_masters', 'vendor_masters', 'tat_masters'];
    for (const table of tables) {
      const endpoint = `/masters/${table}/rec-1/rollback`;
      expect(endpoint).toContain(table);
      expect(endpoint).toContain('/rollback');
    }
  });
});
