import fs from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import type { DayOfWeek, ScheduleTemplate, ScheduleTemplateMapping, ScheduleType } from "./types.js";
import { dayLabels } from "./time.js";

const dayHeaderMap: Record<string, DayOfWeek> = {
  월: "monday",
  월요일: "monday",
  mon: "monday",
  monday: "monday",
  화: "tuesday",
  화요일: "tuesday",
  tue: "tuesday",
  tuesday: "tuesday",
  수: "wednesday",
  수요일: "wednesday",
  wed: "wednesday",
  wednesday: "wednesday",
  목: "thursday",
  목요일: "thursday",
  thu: "thursday",
  thursday: "thursday",
  금: "friday",
  금요일: "friday",
  fri: "friday",
  friday: "friday",
  토: "saturday",
  토요일: "saturday",
  sat: "saturday",
  saturday: "saturday",
  일: "sunday",
  일요일: "sunday",
  sun: "sunday",
  sunday: "sunday"
};

export async function inspectWorkbook(filePath: string): Promise<{ mapping: ScheduleTemplateMapping; values: string[][] }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("Workbook has no worksheets");
  const sheetName = sheet.name;
  const values: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    values[rowNumber - 1] = [];
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      values[rowNumber - 1][colNumber - 1] = cellText(cell.value);
    });
  });
  let headerRow = 0;
  let timeColumn = 0;
  const dayColumns: Partial<Record<DayOfWeek, number>> = {};

  const maxScanRow = Math.min(sheet.rowCount, 10);
  for (let row = 1; row <= maxScanRow; row += 1) {
    const worksheetRow = sheet.getRow(row);
    for (let col = 1; col <= sheet.columnCount; col += 1) {
      const text = cellText(worksheetRow.getCell(col).value).trim().toLowerCase();
      const day = dayHeaderMap[text];
      if (day) {
        headerRow = row;
        dayColumns[day] = col;
      }
      if (/^시간$|time/i.test(text)) timeColumn = col;
    }
    if (Object.keys(dayColumns).length > 0) break;
  }

  if (timeColumn === 0) timeColumn = 1;
  const mapping: ScheduleTemplateMapping = {
    sheetName,
    headerRow,
    timeColumn,
    dayColumns,
    startRow: headerRow + 1,
    endRow: sheet.rowCount,
    columnWidths: Array.from({ length: sheet.columnCount }, (_, index) => sheet.getColumn(index + 1).width),
    rowHeights: Array.from({ length: sheet.rowCount }, (_, index) => sheet.getRow(index + 1).height),
    merges: []
  };
  return { mapping, values };
}

export async function exportTemplateToWorkbook(template: ScheduleTemplate, filePath: string): Promise<string> {
  const rows = templateToRows(template);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(template.mapping?.sheetName ?? `${template.scheduleType}_schedule`);
  sheet.addRows(rows);
  template.mapping?.columnWidths?.forEach((width, index) => {
    if (width) sheet.getColumn(index + 1).width = width;
  });
  template.mapping?.rowHeights?.forEach((height, index) => {
    if (height) sheet.getRow(index + 1).height = height;
  });
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

export function templateToRows(template: ScheduleTemplate): string[][] {
  const days = Object.keys(dayLabels) as DayOfWeek[];
  const usedDays = days.filter((day) => template.slots.some((slot) => slot.dayOfWeek === day));
  const times = [...new Set(template.slots.map((slot) => slot.startTime))].sort();
  const rows: string[][] = [["시간", ...usedDays.map((day) => dayLabels[day])]];
  for (const time of times) {
    rows.push([
      time,
      ...usedDays.map((day) => {
        const slot = template.slots.find((item) => item.dayOfWeek === day && item.startTime === time);
        if (!slot || slot.status === "available") return "";
        if (slot.status === "holiday") return "공휴일";
        if (slot.status === "center_closed") return slot.note ?? "센터 휴무";
        return template.scheduleType === "group" ? [slot.groupTitle, slot.instructor].filter(Boolean).join(" / ") : slot.displayName ?? "";
      })
    ]);
  }
  return rows;
}

export function scheduleTypeFromFilename(filePath: string): ScheduleType {
  return path.basename(filePath).toLowerCase().includes("private") ? "private" : "group";
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return String(value.result ?? "");
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
    return "";
  }
  return String(value);
}
