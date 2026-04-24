export interface CalendarDateLike {
  day: number;
  month: number;
  year: number;
}

export interface DatePreset {
  label: string;
  offsetDays?: number;
  value?: number;
}

export function timestampToCalendarDate(timestamp: number | null | undefined): CalendarDateLike | null {
  if (!timestamp || timestamp <= 0) {
    return null;
  }
  const date = new Date(timestamp);
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

export function calendarDateToTimestamp(date: CalendarDateLike | null | undefined, endOfDay: boolean = true): number | null {
  if (!date) {
    return null;
  }
  if (endOfDay) {
    return new Date(date.year, date.month - 1, date.day, 23, 59, 59).getTime();
  }
  return new Date(date.year, date.month - 1, date.day, 0, 0, 0).getTime();
}

export function isPermanentDate(value: number | null | undefined): boolean {
  return !value || value <= 0;
}

export function getDefaultDatePresets(): DatePreset[] {
  return [
    { label: "1 周后", offsetDays: 7 },
    { label: "1 月后", offsetDays: 30 },
    { label: "半年后", offsetDays: 180 },
    { label: "1 年后", offsetDays: 365 },
    { label: "3 年后", offsetDays: 1095 },
    { label: "永久", value: 0 },
  ];
}

export function calculateDateFromPreset(preset: DatePreset): number {
  if (preset.value !== undefined) {
    return preset.value;
  }
  if (preset.offsetDays !== undefined) {
    const now = new Date();
    now.setDate(now.getDate() + preset.offsetDays);
    now.setHours(23, 59, 59, 999);
    return now.getTime();
  }
  return 0;
}
