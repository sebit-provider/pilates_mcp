import fs from "node:fs/promises";
import path from "node:path";
import { PosterService } from "../service.js";
import { LocalStorage } from "../storage.js";
import { assertInside, nowIso } from "../util.js";
import { exportTemplateToWorkbook, inspectWorkbook, scheduleTypeFromFilename } from "./excel.js";
import { HolidayProvider, LocalHolidayProvider } from "./holidays.js";
import { ScheduleRepository, defaultScheduleSettings } from "./repository.js";
import { dateForDay, dayForDate, daysForDisplay, isMonday, parseTime, slotTimes } from "./time.js";
import type {
  CenterClosure,
  CreateScheduleTemplateInput,
  DayOfWeek,
  FindAvailableSlotsInput,
  ScheduleSettings,
  ScheduleSlot,
  ScheduleTemplate,
  ScheduleType,
  ScheduleValidationIssue,
  SetScheduleSlotInput
} from "./types.js";

export class ScheduleService {
  private readonly repo: ScheduleRepository;
  private readonly holidayProvider: HolidayProvider;
  private readonly drafts = new Map<ScheduleType, ScheduleTemplate>();

  constructor(
    private readonly storage: LocalStorage,
    private readonly posters: PosterService,
    holidayProvider: HolidayProvider = new LocalHolidayProvider()
  ) {
    this.repo = new ScheduleRepository(storage);
    this.holidayProvider = holidayProvider;
  }

  async getScheduleSettings(): Promise<ScheduleSettings> {
    return this.repo.getSettings();
  }

  async updateScheduleSettings(patch: Partial<ScheduleSettings>): Promise<ScheduleSettings> {
    return this.repo.updateSettings(patch);
  }

  async inspectScheduleFile(input: { filePath: string }) {
    const filePath = this.safeWorkspacePath(input.filePath);
    const inspected = await inspectWorkbook(filePath);
    return { filePath, ...inspected };
  }

  async importScheduleFile(input: { filePath: string; scheduleType?: ScheduleType }) {
    const filePath = this.safeWorkspacePath(input.filePath);
    const inspected = await inspectWorkbook(filePath);
    const scheduleType = input.scheduleType ?? scheduleTypeFromFilename(filePath);
    const settings = await this.repo.getSettings();
    const template = this.createTemplateObject(scheduleType, settings);
    const imported = this.applyWorkbookValues(template, inspected.values, inspected.mapping);
    imported.mapping = inspected.mapping;
    imported.sourceFile = path.basename(filePath);
    imported.saveState = "dirty";
    this.drafts.set(scheduleType, imported);
    return { scheduleType, template: imported, mapping: inspected.mapping, saveState: imported.saveState };
  }

  async createScheduleTemplate(input: CreateScheduleTemplateInput) {
    const baseSettings = await this.repo.getSettings();
    const settings = { ...baseSettings, ...(input.settings ?? {}) };
    const validation = this.validateSettings(settings);
    if (!validation.valid) return validation;
    const template = this.createTemplateObject(input.scheduleType, settings);
    this.drafts.set(input.scheduleType, template);
    return { valid: true, scheduleType: input.scheduleType, template, saveState: "dirty" };
  }

  async getSchedule(input: { scheduleType: ScheduleType }) {
    const template = await this.getWorkingTemplate(input.scheduleType);
    return { scheduleType: input.scheduleType, template, saveState: template?.saveState ?? "clean" };
  }

  async generateWeeklySchedule(input: { scheduleType: ScheduleType; weekStart: string; applyHolidays?: boolean; applyCenterClosures?: boolean }) {
    if (!isMonday(input.weekStart)) throw new Error("weekStart must be a Monday date in YYYY-MM-DD format");
    const template = await this.requireWorkingTemplate(input.scheduleType);
    const settings = template.settings;
    const generated = template.slots.map((slot) => ({ ...slot, id: `${slot.id}_${input.weekStart}`, date: dateForDay(input.weekStart, slot.dayOfWeek) }));
    const endDate = dateForDay(input.weekStart, "sunday");

    if (input.applyHolidays ?? settings.autoHolidayMarking) {
      const holidays = await this.holidayProvider.getHolidays({
        countryCode: settings.countryCode,
        locale: settings.locale,
        startDate: input.weekStart,
        endDate
      });
      for (const holiday of holidays) {
        for (const slot of generated.filter((item) => item.date === holiday.date && item.status === "available")) {
          slot.status = "holiday";
          slot.note = holiday.name;
        }
      }
    }

    if (input.applyCenterClosures ?? true) {
      const closures = await this.repo.getClosures();
      for (const closure of closures.filter((item) => item.date >= input.weekStart && item.date <= endDate)) {
        for (const slot of generated.filter((item) => item.date === closure.date)) {
          if (slot.status === "occupied") continue;
          slot.status = "center_closed";
          slot.note = closure.label ?? "센터 휴무";
        }
      }
    }

    return { scheduleType: input.scheduleType, weekStart: input.weekStart, slots: generated, saveState: "dirty" };
  }

  async setScheduleSlot(input: SetScheduleSlotInput) {
    const template = await this.requireWorkingTemplate(input.scheduleType);
    this.assertNoForbiddenMemberFields(input);
    const day = input.dayOfWeek ?? (input.date ? dayForDate(input.date) : undefined);
    if (!day) throw new Error("dayOfWeek or date is required");
    const slot = template.slots.find((item) => item.dayOfWeek === day && item.startTime === input.startTime);
    if (!slot) throw new Error("Slot not found");
    if (slot.status === "occupied" && !input.overwrite) {
      return { success: false, conflicts: [{ day, time: input.startTime, existing: "occupied" }] };
    }
    if (slot.status === "holiday" || slot.status === "center_closed") {
      return { success: false, conflicts: [{ day, time: input.startTime, existing: slot.status }] };
    }
    if (input.endTime) slot.endTime = input.endTime;
    if (input.scheduleType === "private") {
      slot.displayName = input.displayName ?? input.groupTitle ?? "";
      slot.groupTitle = undefined;
      slot.instructor = undefined;
    } else {
      slot.groupTitle = input.groupTitle ?? input.displayName ?? "";
      slot.instructor = input.instructor;
      slot.displayName = undefined;
    }
    slot.note = input.note;
    slot.status = "occupied";
    template.updatedAt = nowIso();
    template.saveState = "dirty";
    this.drafts.set(input.scheduleType, template);
    return { success: true, slot, saveState: template.saveState };
  }

  async clearScheduleSlot(input: { scheduleType: ScheduleType; dayOfWeek?: DayOfWeek; date?: string; startTime: string }) {
    const template = await this.requireWorkingTemplate(input.scheduleType);
    const day = input.dayOfWeek ?? (input.date ? dayForDate(input.date) : undefined);
    if (!day) throw new Error("dayOfWeek or date is required");
    const slot = template.slots.find((item) => item.dayOfWeek === day && item.startTime === input.startTime);
    if (!slot) throw new Error("Slot not found");
    slot.displayName = undefined;
    slot.groupTitle = undefined;
    slot.instructor = undefined;
    slot.note = undefined;
    slot.status = "available";
    template.updatedAt = nowIso();
    template.saveState = "dirty";
    this.drafts.set(input.scheduleType, template);
    return { success: true, slot, saveState: template.saveState };
  }

  async findAvailableSlots(input: FindAvailableSlotsInput) {
    const template = await this.requireWorkingTemplate(input.scheduleType);
    const from = input.fromTime ? parseTime(input.fromTime) : Number.NEGATIVE_INFINITY;
    const to = input.toTime ? parseTime(input.toTime) : Number.POSITIVE_INFINITY;
    const duration = input.duration ?? template.settings.defaultSlotMinutes;
    const day = input.dayOfWeek ?? (input.date ? dayForDate(input.date) : undefined);
    const availableSlots = template.slots
      .filter((slot) => !day || slot.dayOfWeek === day)
      .filter((slot) => slot.status === "available")
      .filter((slot) => parseTime(slot.startTime) >= from && parseTime(slot.endTime) <= to)
      .filter((slot) => parseTime(slot.endTime) - parseTime(slot.startTime) >= duration)
      .map((slot) => ({ date: input.date, dayOfWeek: slot.dayOfWeek, startTime: slot.startTime, endTime: slot.endTime }));
    return { availableSlots };
  }

  async validateSchedule(input: { scheduleType: ScheduleType }) {
    const template = await this.requireWorkingTemplate(input.scheduleType);
    const issues: ScheduleValidationIssue[] = [];
    const seen = new Set<string>();
    const open = parseTime(template.settings.openingTime);
    const close = parseTime(template.settings.closingTime);
    for (const slot of template.slots) {
      const key = `${slot.dayOfWeek}:${slot.startTime}`;
      if (seen.has(key)) issues.push({ severity: "error", code: "duplicate_slot", message: `중복 슬롯: ${key}`, slotId: slot.id });
      seen.add(key);
      const start = parseTime(slot.startTime);
      const end = parseTime(slot.endTime);
      if (start >= end) issues.push({ severity: "error", code: "invalid_time_range", message: "시작 시간이 종료 시간보다 늦거나 같습니다.", slotId: slot.id });
      if (start < open || end > close) issues.push({ severity: "error", code: "outside_opening_hours", message: "운영시간 밖 일정입니다.", slotId: slot.id });
      if ((slot.status === "holiday" || slot.status === "center_closed") && (slot.displayName || slot.groupTitle)) {
        issues.push({ severity: "warning", code: "occupied_closed_slot", message: "휴무 슬롯에 일정 값이 있습니다.", slotId: slot.id });
      }
    }
    if (template.mapping && Object.keys(template.mapping.dayColumns).length === 0) {
      issues.push({ severity: "warning", code: "mapping_missing_day_columns", message: "Excel mapping에서 요일 열을 찾지 못했습니다." });
    }
    return { valid: issues.every((issue) => issue.severity !== "error"), issues };
  }

  async addCenterClosure(input: { date: string; label?: string }) {
    const warnings = await this.closureWarnings(input.date);
    const closure = await this.repo.addClosure(input);
    return { closure, warnings, requiresConfirmation: warnings.length > 0 };
  }

  async removeCenterClosure(input: { date: string }) {
    return this.repo.removeClosure(input.date);
  }

  async getCenterClosures(): Promise<CenterClosure[]> {
    return this.repo.getClosures();
  }

  async saveSchedule(input: { scheduleType: ScheduleType }) {
    const template = await this.requireWorkingTemplate(input.scheduleType);
    template.saveState = "saving";
    try {
      const saved = await this.repo.saveTemplate(template);
      this.drafts.set(input.scheduleType, saved);
      return { success: true, saveState: saved.saveState, template: saved };
    } catch (error) {
      template.saveState = "error";
      return { success: false, saveState: "error", error: (error as Error).message };
    }
  }

  async exportSchedule(input: { scheduleType: ScheduleType; filename?: string }) {
    const template = await this.requireWorkingTemplate(input.scheduleType);
    const filename = input.filename ?? `${input.scheduleType}_schedule.xlsx`;
    await this.repo.backupExport(input.scheduleType, filename);
    const filePath = await this.repo.exportPath(input.scheduleType, filename);
    await exportTemplateToWorkbook(template, filePath);
    return { scheduleType: input.scheduleType, filePath, backupCreated: true };
  }

  async createSchedulePoster(input: { scheduleType: ScheduleType; weekStart?: string; title: string; render?: false | { png?: boolean; pdf?: boolean; size?: "instagram-portrait" | "instagram-square" | "story" | "a4-portrait" } }) {
    const template = input.weekStart
      ? { slots: (await this.generateWeeklySchedule({ scheduleType: input.scheduleType, weekStart: input.weekStart })).slots }
      : await this.requireWorkingTemplate(input.scheduleType);
    const publicSlots = template.slots.filter((slot) => input.scheduleType === "group" && slot.status === "occupied");
    const rows = publicSlots.map((slot) => [slot.dayOfWeek, slot.startTime, slot.groupTitle ?? "", slot.instructor ?? ""]);
    return this.posters.createPoster({
      title: input.title,
      layout: "table",
      purpose: "schedule",
      brief: {
        eventName: input.title,
        programCategories: ["group"],
        programSeparation: "table",
        tablePreference: "required",
        tableStyle: "single",
        vatPolicy: "not_applicable"
      },
      content: {
        subtitle: input.weekStart ? `${input.weekStart} 주간 시간표` : "그룹레슨 시간표",
        table: {
          columns: ["요일", "시간", "수업", "강사"],
          rows,
          highlightColumn: 2
        },
        note: input.scheduleType === "private" ? "개인 시간표의 표시 이름은 홍보 포스터에서 제외되었습니다." : undefined
      },
      render: input.render
    });
  }

  private createTemplateObject(scheduleType: ScheduleType, settings: ScheduleSettings): ScheduleTemplate {
    const now = nowIso();
    const days = daysForDisplay(settings.weekDisplay);
    const slots: ScheduleSlot[] = [];
    for (const day of days) {
      for (const time of slotTimes(settings)) {
        slots.push({
          id: `${scheduleType}_${day}_${time.startTime.replace(":", "")}`,
          scheduleType,
          dayOfWeek: day,
          startTime: time.startTime,
          endTime: time.endTime,
          status: "available"
        });
      }
    }
    return {
      id: `${scheduleType}_weekly_template`,
      scheduleType,
      settings,
      slots,
      createdAt: now,
      updatedAt: now,
      saveState: "dirty"
    };
  }

  private applyWorkbookValues(template: ScheduleTemplate, values: string[][], mapping: NonNullable<ScheduleTemplate["mapping"]>): ScheduleTemplate {
    const dayEntries = Object.entries(mapping.dayColumns) as Array<[DayOfWeek, number]>;
    for (let row = mapping.startRow; row <= mapping.endRow; row += 1) {
      const time = values[row - 1]?.[mapping.timeColumn - 1];
      if (!time) continue;
      for (const [day, col] of dayEntries) {
        const value = values[row - 1]?.[col - 1];
        if (!value) continue;
        const slot = template.slots.find((item) => item.dayOfWeek === day && item.startTime === String(time).slice(0, 5));
        if (!slot) continue;
        if (template.scheduleType === "group") slot.groupTitle = String(value);
        else slot.displayName = String(value);
        slot.status = "occupied";
      }
    }
    return template;
  }

  private validateSettings(settings: ScheduleSettings): { valid: boolean; missing: string[]; questions: string[] } {
    const missing: string[] = [];
    const questions: string[] = [];
    for (const key of ["weekDisplay", "openingTime", "closingTime", "defaultSlotMinutes", "autoHolidayMarking", "locale", "countryCode"] as const) {
      if (settings[key] === undefined || settings[key] === null || settings[key] === "") missing.push(key);
    }
    if (missing.includes("weekDisplay")) questions.push("표시 요일은 월~금, 월~토, 월~일 중 무엇인가요?");
    if (missing.includes("openingTime") || missing.includes("closingTime")) questions.push("운영 시간은 몇 시부터 몇 시까지인가요?");
    if (missing.includes("defaultSlotMinutes")) questions.push("기본 슬롯 단위는 몇 분인가요?");
    return { valid: missing.length === 0, missing, questions };
  }

  private async getWorkingTemplate(scheduleType: ScheduleType): Promise<ScheduleTemplate | null> {
    return this.drafts.get(scheduleType) ?? (await this.repo.getTemplate(scheduleType));
  }

  private async requireWorkingTemplate(scheduleType: ScheduleType): Promise<ScheduleTemplate> {
    const template = await this.getWorkingTemplate(scheduleType);
    if (!template) throw new Error(`No ${scheduleType} schedule template exists. Create or import one first.`);
    return template;
  }

  private safeWorkspacePath(filePath: string): string {
    const resolved = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
    return assertInside(process.cwd(), resolved);
  }

  private assertNoForbiddenMemberFields(input: object): void {
    const forbidden = ["phone", "email", "address", "birthDate", "gender", "healthCondition", "medicalHistory", "payment", "membership", "consultation", "attendanceProfile", "marketingConsent"];
    const present = forbidden.filter((key) => key in input);
    if (present.length > 0) throw new Error(`Forbidden member data fields: ${present.join(", ")}`);
  }

  private async closureWarnings(date: string): Promise<string[]> {
    const day = dayForDate(date);
    const warnings: string[] = [];
    for (const scheduleType of ["group", "private"] as const) {
      const template = await this.getWorkingTemplate(scheduleType);
      const count = template?.slots.filter((slot) => slot.dayOfWeek === day && slot.status === "occupied").length ?? 0;
      if (count > 0) warnings.push(`${scheduleType} 시간표에 기존 일정 ${count}건이 있습니다.`);
    }
    return warnings;
  }
}
