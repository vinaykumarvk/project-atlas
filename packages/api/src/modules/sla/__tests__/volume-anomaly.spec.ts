import { Test, TestingModule } from '@nestjs/testing';
import { VolumeAnomalyService } from '../services/volume-anomaly.service';
import { PrismaService } from '../../../common/prisma';
import { createMockPrismaService } from '../../../common/prisma/prisma.service.mock';

describe('VolumeAnomalyService (FR-112.A3)', () => {
  let service: VolumeAnomalyService;

  beforeEach(async () => {
    const prisma = createMockPrismaService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VolumeAnomalyService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<VolumeAnomalyService>(VolumeAnomalyService);
  });

  it('should record daily volumes', () => {
    service.recordDailyVolume('2026-04-01', 100);
    const history = service.getVolumeHistory(10);
    expect(history).toEqual([{ date: '2026-04-01', volume: 100 }]);
  });

  it('should return no anomaly when insufficient data (< 7 days)', () => {
    service.recordDailyVolume('2026-04-01', 100);
    service.recordDailyVolume('2026-04-02', 110);
    service.recordDailyVolume('2026-04-03', 105);

    const result = service.detectAnomaly();
    expect(result.isAnomaly).toBe(false);
    expect(result.rollingAvg).toBe(0);
  });

  it('should detect no anomaly when today volume is within 2 sigma', () => {
    const today = new Date().toISOString().split('T')[0];
    // Record 10 days of varying volumes to create nonzero stdDev
    const volumes = [90, 95, 100, 105, 110, 95, 100, 105, 100, 100];
    for (let i = 1; i <= 10; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      service.recordDailyVolume(date.toISOString().split('T')[0], volumes[i - 1]);
    }
    // Today's volume is within normal range (mean~100, stdDev~6)
    service.recordDailyVolume(today, 105);

    const result = service.detectAnomaly();
    expect(result.isAnomaly).toBe(false);
    expect(result.rollingAvg).toBe(100);
  });

  it('should detect anomaly when today volume exceeds 2 sigma', () => {
    const today = new Date().toISOString().split('T')[0];
    // Record 10 days of consistent volumes (mean=100, stdDev~0)
    for (let i = 1; i <= 10; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      service.recordDailyVolume(date.toISOString().split('T')[0], 100);
    }
    // Today's volume is way above threshold
    service.recordDailyVolume(today, 500);

    const result = service.detectAnomaly();
    expect(result.isAnomaly).toBe(true);
    expect(result.todayVolume).toBe(500);
    expect(result.threshold).toBe(100); // avg=100, stdDev=0, threshold=100+0=100
  });

  it('should return volume history sorted by date descending', () => {
    service.recordDailyVolume('2026-04-01', 100);
    service.recordDailyVolume('2026-04-03', 120);
    service.recordDailyVolume('2026-04-02', 110);

    const history = service.getVolumeHistory(10);
    expect(history[0].date).toBe('2026-04-03');
    expect(history[1].date).toBe('2026-04-02');
    expect(history[2].date).toBe('2026-04-01');
  });

  it('should limit volume history to requested number of days', () => {
    for (let i = 1; i <= 20; i++) {
      service.recordDailyVolume(`2026-04-${String(i).padStart(2, '0')}`, 100 + i);
    }

    const history = service.getVolumeHistory(5);
    expect(history).toHaveLength(5);
  });
});
