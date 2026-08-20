import fs from "node:fs/promises";
import path from "node:path";
import { LocalStorage } from "../storage.js";
import { nowIso } from "../util.js";
import type { CenterClosure, ScheduleSettings, ScheduleTemplate, ScheduleType } from "./types.js";

export const defaultScheduleSettings: ScheduleSettings = {
  weekDisplay: "mon-sat",
  openingTime: "09:00",
  closingTime: "21:00",
  defaultSlotMinutes: 60,
  autoHolidayMarking: true,
  locale: "ko-KR",
  countryCode: "KR"
};

export class ScheduleRepository {
  constructor(private readonly storage: LocalStorage) {}

  async getSettings(): Promise<ScheduleSettings> {
    return this.storage.readJson("schedules/settings.json", defaultScheduleSettings);
  }

  async updateSettings(patch: Partial<ScheduleSettings>): Promise<ScheduleSettings> {
    const settings = { ...(await this.getSettings()), ...patch };
    await this.storage.writeJson("schedules/settings.json", settings);
    return settings;
  }

  async getTemplate(scheduleType: ScheduleType): Promise<ScheduleTemplate | null> {
    const empty = null as ScheduleTemplate | null;
    return this.storage.readJson(`schedules/${scheduleType}/template.json`, empty);
  }

  async saveTemplate(template: ScheduleTemplate): Promise<ScheduleTemplate> {
    const current = await this.getTemplate(template.scheduleType);
    if (current) {
      const stamp = nowIso().replace(/[:.]/g, "-");
      await this.storage.writeJson(`schedules/${template.scheduleType}/revisions/template_${stamp}.json`, current);
    }
    const saved = { ...template, saveState: "saved" as const, updatedAt: nowIso() };
    await this.storage.writeJson(`schedules/${template.scheduleType}/template.json`, saved);
    return saved;
  }

  async exportPath(scheduleType: ScheduleType, filename = `${scheduleType}_schedule.xlsx`): Promise<string> {
    return this.storage.resolve("schedules", scheduleType, filename);
  }

  async backupExport(scheduleType: ScheduleType, filename = `${scheduleType}_schedule.xlsx`): Promise<void> {
    const file = await this.exportPath(scheduleType, filename);
    try {
      await fs.access(file);
    } catch {
      return;
    }
    const stamp = nowIso().replace(/[:.]/g, "-");
    const revision = this.storage.resolve("schedules", scheduleType, "revisions", filename.replace(/\.xlsx$/i, `_${stamp}.xlsx`));
    await fs.mkdir(path.dirname(revision), { recursive: true });
    await fs.copyFile(file, revision);
  }

  async getClosures(): Promise<CenterClosure[]> {
    return this.storage.readJson("schedules/center-closures.json", []);
  }

  async addClosure(input: { date: string; label?: string }): Promise<CenterClosure> {
    const closures = await this.getClosures();
    const closure = { date: input.date, label: input.label, createdAt: nowIso() };
    const filtered = closures.filter((item) => item.date !== input.date);
    filtered.push(closure);
    await this.storage.writeJson("schedules/center-closures.json", filtered);
    return closure;
  }

  async removeClosure(date: string): Promise<{ removed: boolean }> {
    const closures = await this.getClosures();
    const filtered = closures.filter((item) => item.date !== date);
    await this.storage.writeJson("schedules/center-closures.json", filtered);
    return { removed: filtered.length !== closures.length };
  }
}
