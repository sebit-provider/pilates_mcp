export const scheduleTypes = ["group", "private"] as const;
export type ScheduleType = (typeof scheduleTypes)[number];

export const weekDisplays = ["mon-fri", "mon-sat", "mon-sun"] as const;
export type WeekDisplay = (typeof weekDisplays)[number];

export const dayOfWeeks = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type DayOfWeek = (typeof dayOfWeeks)[number];

export type ScheduleSaveState = "clean" | "dirty" | "saving" | "saved" | "error";

export type ScheduleSlotStatus = "available" | "occupied" | "holiday" | "center_closed";

export interface ScheduleSettings {
  weekDisplay: WeekDisplay;
  openingTime: string;
  closingTime: string;
  defaultSlotMinutes: number;
  autoHolidayMarking: boolean;
  locale: string;
  countryCode: string;
}

export interface GroupScheduleEntry {
  title: string;
  instructor?: string;
  note?: string;
}

export interface ScheduleSlot {
  id: string;
  scheduleType: ScheduleType;
  date?: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  displayName?: string;
  groupTitle?: string;
  instructor?: string;
  status: ScheduleSlotStatus;
  note?: string;
}

export interface ScheduleTemplateMapping {
  sheetName: string;
  headerRow: number;
  timeColumn: number;
  dayColumns: Partial<Record<DayOfWeek, number>>;
  startRow: number;
  endRow: number;
  columnWidths?: Array<number | undefined>;
  rowHeights?: Array<number | undefined>;
  merges?: Array<string>;
}

export interface ScheduleTemplate {
  id: string;
  scheduleType: ScheduleType;
  settings: ScheduleSettings;
  slots: ScheduleSlot[];
  mapping?: ScheduleTemplateMapping;
  sourceFile?: string;
  createdAt: string;
  updatedAt: string;
  saveState: ScheduleSaveState;
}

export interface Holiday {
  date: string;
  name: string;
  source: string;
}

export interface CenterClosure {
  date: string;
  label?: string;
  createdAt: string;
}

export interface ScheduleValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  slotId?: string;
}

export interface ScheduleWorkspaceState {
  scheduleType: ScheduleType;
  template?: ScheduleTemplate;
  saveState: ScheduleSaveState;
  sourceFile?: string;
}

export interface CreateScheduleTemplateInput {
  scheduleType: ScheduleType;
  settings?: Partial<ScheduleSettings>;
}

export interface SetScheduleSlotInput {
  scheduleType: ScheduleType;
  dayOfWeek?: DayOfWeek;
  date?: string;
  startTime: string;
  endTime?: string;
  displayName?: string;
  groupTitle?: string;
  instructor?: string;
  note?: string;
  overwrite?: boolean;
}

export interface FindAvailableSlotsInput {
  scheduleType: ScheduleType;
  date?: string;
  dayOfWeek?: DayOfWeek;
  fromTime?: string;
  toTime?: string;
  duration?: number;
}
