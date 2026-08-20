import type { DayOfWeek, ScheduleSettings, WeekDisplay } from "./types.js";

export const dayLabels: Record<DayOfWeek, string> = {
  monday: "월",
  tuesday: "화",
  wednesday: "수",
  thursday: "목",
  friday: "금",
  saturday: "토",
  sunday: "일"
};

export function daysForDisplay(display: WeekDisplay): DayOfWeek[] {
  if (display === "mon-fri") return ["monday", "tuesday", "wednesday", "thursday", "friday"];
  if (display === "mon-sat") return ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  return ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
}

export function parseTime(value: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new Error(`Invalid time: ${value}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function slotTimes(settings: ScheduleSettings): Array<{ startTime: string; endTime: string }> {
  const start = parseTime(settings.openingTime);
  const end = parseTime(settings.closingTime);
  if (end <= start) throw new Error("closingTime must be after openingTime");
  if (settings.defaultSlotMinutes < 10 || settings.defaultSlotMinutes > 240) {
    throw new Error("defaultSlotMinutes must be between 10 and 240");
  }
  const slots: Array<{ startTime: string; endTime: string }> = [];
  for (let current = start; current + settings.defaultSlotMinutes <= end; current += settings.defaultSlotMinutes) {
    slots.push({ startTime: formatTime(current), endTime: formatTime(current + settings.defaultSlotMinutes) });
  }
  return slots;
}

export function dateForDay(weekStart: string, day: DayOfWeek): string {
  const offset = daysForDisplay("mon-sun").indexOf(day);
  const date = new Date(`${weekStart}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function dayForDate(date: string): DayOfWeek {
  const jsDay = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][jsDay] as DayOfWeek;
}

export function isMonday(date: string): boolean {
  return dayForDate(date) === "monday";
}
