import type { Holiday } from "./types.js";

export interface HolidayProvider {
  getHolidays(input: { countryCode: string; locale: string; startDate: string; endDate: string }): Promise<Holiday[]>;
}

const localHolidays: Record<string, Holiday[]> = {
  KR: [
    { date: "2026-01-01", name: "신정", source: "local-kr" },
    { date: "2026-03-01", name: "삼일절", source: "local-kr" },
    { date: "2026-05-05", name: "어린이날", source: "local-kr" },
    { date: "2026-08-15", name: "광복절", source: "local-kr" },
    { date: "2026-10-03", name: "개천절", source: "local-kr" },
    { date: "2026-10-09", name: "한글날", source: "local-kr" },
    { date: "2026-12-25", name: "성탄절", source: "local-kr" }
  ]
};

export class LocalHolidayProvider implements HolidayProvider {
  async getHolidays(input: { countryCode: string; locale: string; startDate: string; endDate: string }): Promise<Holiday[]> {
    const holidays = localHolidays[input.countryCode.toUpperCase()] ?? [];
    return holidays.filter((holiday) => holiday.date >= input.startDate && holiday.date <= input.endDate);
  }
}
