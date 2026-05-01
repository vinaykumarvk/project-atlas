import {
  computeElapsedBusinessHours,
  computeTargetDatetime,
  BusinessHoursConfig,
  Holiday,
} from '../business-hours';

// Standard Mon-Fri 09:30-18:30 IST schedule
const STANDARD_SCHEDULE: BusinessHoursConfig[] = [
  { day_of_week: 'MON', open_time: '09:30', close_time: '18:30', is_working: true },
  { day_of_week: 'TUE', open_time: '09:30', close_time: '18:30', is_working: true },
  { day_of_week: 'WED', open_time: '09:30', close_time: '18:30', is_working: true },
  { day_of_week: 'THU', open_time: '09:30', close_time: '18:30', is_working: true },
  { day_of_week: 'FRI', open_time: '09:30', close_time: '18:30', is_working: true },
  { day_of_week: 'SAT', open_time: '09:30', close_time: '18:30', is_working: false },
  { day_of_week: 'SUN', open_time: '09:30', close_time: '18:30', is_working: false },
];

// Helper: create UTC date from IST time string "YYYY-MM-DD HH:MM"
function istToUtc(istStr: string): Date {
  const [datePart, timePart] = istStr.split(' ');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  // IST is UTC+5:30
  const utc = new Date(Date.UTC(year, month - 1, day, hours - 5, minutes - 30));
  return utc;
}

describe('computeElapsedBusinessHours', () => {
  it('should return 0 when end is before start', () => {
    const start = istToUtc('2026-04-28 10:00'); // Tuesday
    const end = istToUtc('2026-04-28 09:00');
    expect(computeElapsedBusinessHours(start, end, STANDARD_SCHEDULE, [])).toBe(0);
  });

  it('should compute hours within a single working day', () => {
    const start = istToUtc('2026-04-27 10:00'); // Monday
    const end = istToUtc('2026-04-27 14:00');
    const result = computeElapsedBusinessHours(start, end, STANDARD_SCHEDULE, []);
    expect(result).toBe(4);
  });

  it('should cap at business hours (start before open)', () => {
    const start = istToUtc('2026-04-27 07:00'); // Monday, before 09:30
    const end = istToUtc('2026-04-27 12:30');
    const result = computeElapsedBusinessHours(start, end, STANDARD_SCHEDULE, []);
    expect(result).toBe(3); // 09:30 to 12:30 = 3 hours
  });

  it('should cap at business hours (end after close)', () => {
    const start = istToUtc('2026-04-27 16:30'); // Monday
    const end = istToUtc('2026-04-27 22:00'); // after 18:30
    const result = computeElapsedBusinessHours(start, end, STANDARD_SCHEDULE, []);
    expect(result).toBe(2); // 16:30 to 18:30 = 2 hours
  });

  it('should span multiple days correctly', () => {
    const start = istToUtc('2026-04-27 17:30'); // Monday 17:30
    const end = istToUtc('2026-04-28 11:30'); // Tuesday 11:30
    const result = computeElapsedBusinessHours(start, end, STANDARD_SCHEDULE, []);
    // Monday: 17:30-18:30 = 1h; Tuesday: 09:30-11:30 = 2h
    expect(result).toBe(3);
  });

  it('should skip weekends', () => {
    const start = istToUtc('2026-04-24 17:00'); // Friday 17:00
    const end = istToUtc('2026-04-27 10:30'); // Monday 10:30
    const result = computeElapsedBusinessHours(start, end, STANDARD_SCHEDULE, []);
    // Friday: 17:00-18:30 = 1.5h; Sat/Sun = 0; Monday: 09:30-10:30 = 1h
    expect(result).toBe(2.5);
  });

  it('should skip holidays', () => {
    const holidays: Holiday[] = [{ date: '2026-04-28' }]; // Tuesday is holiday
    const start = istToUtc('2026-04-27 17:00'); // Monday
    const end = istToUtc('2026-04-29 10:30'); // Wednesday
    const result = computeElapsedBusinessHours(start, end, STANDARD_SCHEDULE, holidays);
    // Monday: 17:00-18:30 = 1.5h; Tuesday = holiday; Wednesday: 09:30-10:30 = 1h
    expect(result).toBe(2.5);
  });

  it('should handle full week correctly', () => {
    const start = istToUtc('2026-04-27 09:30'); // Monday opening
    const end = istToUtc('2026-05-01 18:30'); // Friday closing
    const result = computeElapsedBusinessHours(start, end, STANDARD_SCHEDULE, []);
    // 5 days × 9 hours = 45 hours
    expect(result).toBe(45);
  });
});

describe('computeTargetDatetime', () => {
  it('should compute target within same day', () => {
    const start = istToUtc('2026-04-27 10:00'); // Monday
    const target = computeTargetDatetime(start, 4, STANDARD_SCHEDULE, []);
    const expected = istToUtc('2026-04-27 14:00');
    expect(target.getTime()).toBe(expected.getTime());
  });

  it('should roll over to next working day', () => {
    const start = istToUtc('2026-04-27 17:00'); // Monday 17:00, 1.5h left
    const target = computeTargetDatetime(start, 3, STANDARD_SCHEDULE, []);
    // Monday: 1.5h used (17:00-18:30). Remaining: 1.5h. Tuesday: starts 09:30, ends at 11:00
    const expected = istToUtc('2026-04-28 11:00');
    expect(target.getTime()).toBe(expected.getTime());
  });

  it('should skip weekends', () => {
    const start = istToUtc('2026-04-24 17:00'); // Friday
    const target = computeTargetDatetime(start, 3, STANDARD_SCHEDULE, []);
    // Friday: 1.5h (17:00-18:30). Remaining: 1.5h. Skip Sat/Sun. Monday: 09:30 + 1.5h = 11:00
    const expected = istToUtc('2026-04-27 11:00');
    expect(target.getTime()).toBe(expected.getTime());
  });

  it('should skip holidays', () => {
    const holidays: Holiday[] = [{ date: '2026-04-28' }]; // Tuesday is holiday
    const start = istToUtc('2026-04-27 17:00'); // Monday
    const target = computeTargetDatetime(start, 3, STANDARD_SCHEDULE, holidays);
    // Monday: 1.5h. Remaining: 1.5h. Tuesday = holiday. Wednesday: 09:30 + 1.5h = 11:00
    const expected = istToUtc('2026-04-29 11:00');
    expect(target.getTime()).toBe(expected.getTime());
  });

  it('should handle 48 business hours (typical vendor TAT)', () => {
    const start = istToUtc('2026-04-27 09:30'); // Monday opening
    const target = computeTargetDatetime(start, 48, STANDARD_SCHEDULE, []);
    // 9h/day × 5 days = 45h. Need 48h = 5 full days + 3h into day 6
    // Mon-Fri = 45h. Monday next week: 09:30 + 3h = 12:30
    const expected = istToUtc('2026-05-04 12:30');
    expect(target.getTime()).toBe(expected.getTime());
  });

  it('should handle start before business hours', () => {
    const start = istToUtc('2026-04-27 06:00'); // Monday before open
    const target = computeTargetDatetime(start, 2, STANDARD_SCHEDULE, []);
    // Starts at 09:30 effectively. 09:30 + 2h = 11:30
    const expected = istToUtc('2026-04-27 11:30');
    expect(target.getTime()).toBe(expected.getTime());
  });
});
