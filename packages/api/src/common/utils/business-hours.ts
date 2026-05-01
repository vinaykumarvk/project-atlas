/**
 * Business Hours Calculator
 *
 * Computes elapsed business hours between two timestamps, respecting:
 * - Configurable business hours per day-of-week per region
 * - Holiday calendar (excludes holiday dates entirely)
 * - IST timezone (Asia/Kolkata) for date resolution
 *
 * Also computes a target datetime given a start time and required business hours.
 */

export interface BusinessHoursConfig {
  day_of_week: string; // MON, TUE, WED, THU, FRI, SAT, SUN
  open_time: string; // HH:MM
  close_time: string; // HH:MM
  is_working: boolean;
}

export interface Holiday {
  date: string; // YYYY-MM-DD
}

const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

/** Standard Mon-Fri 09:30-18:30 IST (9 hrs/day) business hours. */
export const DEFAULT_BUSINESS_HOURS: BusinessHoursConfig[] = [
  { day_of_week: 'MON', open_time: '09:30', close_time: '18:30', is_working: true },
  { day_of_week: 'TUE', open_time: '09:30', close_time: '18:30', is_working: true },
  { day_of_week: 'WED', open_time: '09:30', close_time: '18:30', is_working: true },
  { day_of_week: 'THU', open_time: '09:30', close_time: '18:30', is_working: true },
  { day_of_week: 'FRI', open_time: '09:30', close_time: '18:30', is_working: true },
  { day_of_week: 'SAT', open_time: '09:30', close_time: '18:30', is_working: false },
  { day_of_week: 'SUN', open_time: '09:30', close_time: '18:30', is_working: false },
];

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30

function toISTDate(utcDate: Date): Date {
  return new Date(utcDate.getTime() + IST_OFFSET_MS);
}

function getISTDateString(utcDate: Date): string {
  const ist = toISTDate(utcDate);
  return ist.toISOString().split('T')[0];
}

function getISTDayOfWeek(utcDate: Date): string {
  const ist = toISTDate(utcDate);
  return DAY_NAMES[ist.getUTCDay()];
}

function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hours, minutes };
}

function getMinuteOfDay(utcDate: Date): number {
  const ist = toISTDate(utcDate);
  return ist.getUTCHours() * 60 + ist.getUTCMinutes();
}

function isHoliday(utcDate: Date, holidays: Holiday[]): boolean {
  const dateStr = getISTDateString(utcDate);
  return holidays.some((h) => h.date === dateStr);
}

function getScheduleForDay(
  utcDate: Date,
  schedule: BusinessHoursConfig[],
): BusinessHoursConfig | undefined {
  const dow = getISTDayOfWeek(utcDate);
  return schedule.find((s) => s.day_of_week === dow);
}

/**
 * Calculate business minutes available in a single day, optionally starting from a given minute.
 */
function businessMinutesInDay(
  daySchedule: BusinessHoursConfig,
  fromMinute?: number,
  toMinute?: number,
): number {
  if (!daySchedule.is_working) return 0;

  const open = parseTime(daySchedule.open_time);
  const close = parseTime(daySchedule.close_time);
  const openMin = open.hours * 60 + open.minutes;
  const closeMin = close.hours * 60 + close.minutes;

  const effectiveStart = Math.max(fromMinute ?? openMin, openMin);
  const effectiveEnd = Math.min(toMinute ?? closeMin, closeMin);

  return Math.max(0, effectiveEnd - effectiveStart);
}

/**
 * Compute elapsed business hours between two UTC timestamps.
 *
 * @param start - Start time (UTC)
 * @param end - End time (UTC)
 * @param schedule - Business hours configuration per day
 * @param holidays - List of holiday dates
 * @returns Elapsed business hours (decimal)
 */
export function computeElapsedBusinessHours(
  start: Date,
  end: Date,
  schedule: BusinessHoursConfig[],
  holidays: Holiday[],
): number {
  if (end <= start) return 0;

  let totalMinutes = 0;
  const current = new Date(start);

  // Iterate day by day
  while (current < end) {
    const daySchedule = getScheduleForDay(current, schedule);

    if (daySchedule && daySchedule.is_working && !isHoliday(current, holidays)) {
      const currentDateStr = getISTDateString(current);
      const endDateStr = getISTDateString(end);
      const isSameDay = currentDateStr === getISTDateString(start) || currentDateStr === endDateStr;

      let fromMinute: number | undefined;
      let toMinute: number | undefined;

      // If start falls on this day, begin from start time
      if (currentDateStr === getISTDateString(start)) {
        fromMinute = getMinuteOfDay(start);
      }

      // If end falls on this day, end at end time
      if (currentDateStr === endDateStr) {
        toMinute = getMinuteOfDay(end);
      }

      totalMinutes += businessMinutesInDay(daySchedule, fromMinute, toMinute);
    }

    // Advance to next day midnight IST
    const istCurrent = toISTDate(current);
    const nextDayIST = new Date(
      Date.UTC(
        istCurrent.getUTCFullYear(),
        istCurrent.getUTCMonth(),
        istCurrent.getUTCDate() + 1,
        0,
        0,
        0,
      ),
    );
    // Convert back to UTC
    current.setTime(nextDayIST.getTime() - IST_OFFSET_MS);

    if (current >= end) break;
  }

  return totalMinutes / 60;
}

/**
 * Compute the target UTC datetime given a start time and required business hours.
 *
 * @param start - Start time (UTC)
 * @param targetBusinessHours - Number of business hours to add
 * @param schedule - Business hours configuration per day
 * @param holidays - List of holiday dates
 * @returns Target UTC datetime when the business hours expire
 */
export function computeTargetDatetime(
  start: Date,
  targetBusinessHours: number,
  schedule: BusinessHoursConfig[],
  holidays: Holiday[],
): Date {
  let remainingMinutes = targetBusinessHours * 60;
  const current = new Date(start);

  // Safety: max 365 days to prevent infinite loop
  for (let safety = 0; safety < 365 && remainingMinutes > 0; safety++) {
    const daySchedule = getScheduleForDay(current, schedule);

    if (daySchedule && daySchedule.is_working && !isHoliday(current, holidays)) {
      const open = parseTime(daySchedule.open_time);
      const close = parseTime(daySchedule.close_time);
      const openMin = open.hours * 60 + open.minutes;
      const closeMin = close.hours * 60 + close.minutes;

      const currentDateStr = getISTDateString(current);
      const startDateStr = getISTDateString(start);

      let effectiveStartMin = openMin;
      if (currentDateStr === startDateStr) {
        effectiveStartMin = Math.max(getMinuteOfDay(current), openMin);
      }

      if (effectiveStartMin < closeMin) {
        const availableMinutes = closeMin - effectiveStartMin;

        if (remainingMinutes <= availableMinutes) {
          // Target falls within this day
          const targetMinute = effectiveStartMin + remainingMinutes;
          const istCurrent = toISTDate(current);
          const targetIST = new Date(
            Date.UTC(
              istCurrent.getUTCFullYear(),
              istCurrent.getUTCMonth(),
              istCurrent.getUTCDate(),
              Math.floor(targetMinute / 60),
              Math.round(targetMinute % 60),
              0,
            ),
          );
          return new Date(targetIST.getTime() - IST_OFFSET_MS);
        }

        remainingMinutes -= availableMinutes;
      }
    }

    // Advance to next day opening
    const istCurrent = toISTDate(current);
    const nextDayIST = new Date(
      Date.UTC(
        istCurrent.getUTCFullYear(),
        istCurrent.getUTCMonth(),
        istCurrent.getUTCDate() + 1,
        0,
        0,
        0,
      ),
    );
    current.setTime(nextDayIST.getTime() - IST_OFFSET_MS);
  }

  return current;
}
