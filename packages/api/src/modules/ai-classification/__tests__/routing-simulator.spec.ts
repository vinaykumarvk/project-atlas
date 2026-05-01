import { RoutingSimulatorService } from '../services/routing-simulator.service';

describe('RoutingSimulatorService', () => {
  let service: RoutingSimulatorService;

  beforeEach(() => {
    service = new RoutingSimulatorService();
  });

  describe('shadowRun()', () => {
    it('should return 100% match rate when all routes match', async () => {
      const cases = [
        { id: '1', data: { route: 'TEAM_A', case_type: 'VALUATION' } },
        { id: '2', data: { route: 'TEAM_B', case_type: 'LEGAL' } },
      ];
      const rules = [
        { field: 'case_type', pattern: 'VALUATION', route: 'TEAM_A' },
        { field: 'case_type', pattern: 'LEGAL', route: 'TEAM_B' },
      ];

      const report = await service.shadowRun(cases, rules);
      expect(report.totalCases).toBe(2);
      expect(report.matchRate).toBe(1);
      expect(report.mismatches).toHaveLength(0);
    });

    it('should detect mismatches between original and simulated routes', async () => {
      const cases = [
        { id: '1', data: { route: 'TEAM_A', case_type: 'VALUATION' } },
        { id: '2', data: { route: 'TEAM_A', case_type: 'LEGAL' } }, // mismatch
      ];
      const rules = [
        { field: 'case_type', pattern: 'VALUATION', route: 'TEAM_A' },
        { field: 'case_type', pattern: 'LEGAL', route: 'TEAM_B' },
      ];

      const report = await service.shadowRun(cases, rules);
      expect(report.totalCases).toBe(2);
      expect(report.matchRate).toBe(0.5);
      expect(report.mismatches).toHaveLength(1);
      expect(report.mismatches[0].caseId).toBe('2');
      expect(report.mismatches[0].originalRoute).toBe('TEAM_A');
      expect(report.mismatches[0].simulatedRoute).toBe('TEAM_B');
    });

    it('should handle empty cases list', async () => {
      const report = await service.shadowRun([], []);
      expect(report.totalCases).toBe(0);
      expect(report.matchRate).toBe(0);
      expect(report.mismatches).toHaveLength(0);
    });

    it('should use UNASSIGNED when no rule matches', async () => {
      const cases = [
        { id: '1', data: { route: 'TEAM_A', case_type: 'UNKNOWN' } },
      ];
      const rules = [
        { field: 'case_type', pattern: 'VALUATION', route: 'TEAM_A' },
      ];

      const report = await service.shadowRun(cases, rules);
      expect(report.mismatches).toHaveLength(1);
      expect(report.mismatches[0].simulatedRoute).toBe('UNASSIGNED');
    });

    it('should use UNASSIGNED as original when data has no route', async () => {
      const cases = [{ id: '1', data: { case_type: 'VALUATION' } }];
      const rules = [
        { field: 'case_type', pattern: 'VALUATION', route: 'TEAM_A' },
      ];

      const report = await service.shadowRun(cases, rules);
      expect(report.mismatches).toHaveLength(1);
      expect(report.mismatches[0].originalRoute).toBe('UNASSIGNED');
    });

    it('should accept rules as an object with rules property', async () => {
      const cases = [
        { id: '1', data: { route: 'TEAM_A', case_type: 'VALUATION' } },
      ];
      const rules = {
        rules: [
          { field: 'case_type', pattern: 'VALUATION', route: 'TEAM_A' },
        ],
      };

      const report = await service.shadowRun(cases, rules);
      expect(report.matchRate).toBe(1);
    });

    it('should support regex patterns in rules', async () => {
      const cases = [
        {
          id: '1',
          data: { route: 'TEAM_A', case_type: 'VALUATION_REQUEST' },
        },
      ];
      const rules = [
        { field: 'case_type', pattern: '^VALUATION', route: 'TEAM_A' },
      ];

      const report = await service.shadowRun(cases, rules);
      expect(report.matchRate).toBe(1);
    });
  });

  describe('splitTraffic()', () => {
    it('should split cases into two groups based on percentage', () => {
      const cases = Array.from({ length: 10 }, (_, i) => ({
        id: String(i),
      }));

      const { groupA, groupB } = service.splitTraffic(cases, 50);
      expect(groupA.length).toBe(5);
      expect(groupB.length).toBe(5);
    });

    it('should put all cases in groupA when splitPercent is 100', () => {
      const cases = [{ id: '1' }, { id: '2' }, { id: '3' }];

      const { groupA, groupB } = service.splitTraffic(cases, 100);
      expect(groupA.length).toBe(3);
      expect(groupB.length).toBe(0);
    });

    it('should put all cases in groupB when splitPercent is 0', () => {
      const cases = [{ id: '1' }, { id: '2' }, { id: '3' }];

      const { groupA, groupB } = service.splitTraffic(cases, 0);
      expect(groupA.length).toBe(0);
      expect(groupB.length).toBe(3);
    });

    it('should handle empty cases list', () => {
      const { groupA, groupB } = service.splitTraffic([], 50);
      expect(groupA).toEqual([]);
      expect(groupB).toEqual([]);
    });

    it('should clamp splitPercent to 0-100 range', () => {
      const cases = [{ id: '1' }, { id: '2' }];

      const over = service.splitTraffic(cases, 150);
      expect(over.groupA.length).toBe(2);
      expect(over.groupB.length).toBe(0);

      const under = service.splitTraffic(cases, -50);
      expect(under.groupA.length).toBe(0);
      expect(under.groupB.length).toBe(2);
    });

    it('should produce deterministic splits based on case IDs', () => {
      const cases = [{ id: 'c' }, { id: 'a' }, { id: 'b' }];

      const split1 = service.splitTraffic(cases, 33);
      const split2 = service.splitTraffic(cases, 33);

      expect(split1.groupA).toEqual(split2.groupA);
      expect(split1.groupB).toEqual(split2.groupB);
    });

    it('should ensure no overlap between groups', () => {
      const cases = Array.from({ length: 20 }, (_, i) => ({
        id: `case-${i}`,
      }));

      const { groupA, groupB } = service.splitTraffic(cases, 30);
      const overlap = groupA.filter((id) => groupB.includes(id));
      expect(overlap).toHaveLength(0);

      // All cases should be accounted for
      expect(groupA.length + groupB.length).toBe(cases.length);
    });
  });

  describe('compareRoutes()', () => {
    it('should return true for identical routes', () => {
      expect(service.compareRoutes('TEAM_A', 'TEAM_A')).toBe(true);
    });

    it('should be case-insensitive', () => {
      expect(service.compareRoutes('team_a', 'TEAM_A')).toBe(true);
    });

    it('should trim whitespace', () => {
      expect(service.compareRoutes('  TEAM_A ', 'TEAM_A')).toBe(true);
    });

    it('should return false for different routes', () => {
      expect(service.compareRoutes('TEAM_A', 'TEAM_B')).toBe(false);
    });
  });
});
