import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import ExcelJS from "exceljs";
import { ScheduleService } from "../src/schedule/service.js";
import { PosterService } from "../src/service.js";

async function makeServices(): Promise<{ posters: PosterService; schedules: ScheduleService; root: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pilates-schedule-"));
  const posters = new PosterService(root);
  const schedules = new ScheduleService(posters.storage, posters);
  return { posters, schedules, root };
}

test("creates mon-fri mon-sat mon-sun templates with opening hours and slot interval", async () => {
  const { schedules } = await makeServices();
  const fri = await schedules.createScheduleTemplate({
    scheduleType: "group",
    settings: { weekDisplay: "mon-fri", openingTime: "09:00", closingTime: "11:00", defaultSlotMinutes: 60 }
  });
  assert.equal((fri as { valid: boolean }).valid, true);
  assert.equal((fri as { template: { slots: unknown[] } }).template.slots.length, 10);

  const sat = await schedules.createScheduleTemplate({
    scheduleType: "group",
    settings: { weekDisplay: "mon-sat", openingTime: "09:00", closingTime: "10:00", defaultSlotMinutes: 30 }
  });
  assert.equal((sat as { template: { slots: unknown[] } }).template.slots.length, 12);

  const sun = await schedules.createScheduleTemplate({
    scheduleType: "private",
    settings: { weekDisplay: "mon-sun", openingTime: "09:00", closingTime: "10:00", defaultSlotMinutes: 60 }
  });
  assert.equal((sun as { template: { slots: unknown[] } }).template.slots.length, 7);
});

test("sets private display names, detects conflicts, clears cells, and rejects outside hours validation", async () => {
  const { schedules } = await makeServices();
  await schedules.createScheduleTemplate({
    scheduleType: "private",
    settings: { weekDisplay: "mon-fri", openingTime: "09:00", closingTime: "21:00", defaultSlotMinutes: 60 }
  });
  const set = await schedules.setScheduleSlot({ scheduleType: "private", dayOfWeek: "monday", startTime: "19:00", displayName: "김OO" });
  assert.equal(set.success, true);
  const conflict = await schedules.setScheduleSlot({ scheduleType: "private", dayOfWeek: "monday", startTime: "19:00", displayName: "박OO" });
  assert.equal(conflict.success, false);
  assert.ok(conflict.conflicts);
  assert.equal(conflict.conflicts[0].existing, "occupied");
  const cleared = await schedules.clearScheduleSlot({ scheduleType: "private", dayOfWeek: "monday", startTime: "19:00" });
  assert.equal(cleared.slot.status, "available");

  await schedules.setScheduleSlot({ scheduleType: "private", dayOfWeek: "tuesday", startTime: "20:00", endTime: "22:30", displayName: "이민지" });
  const validation = await schedules.validateSchedule({ scheduleType: "private" });
  assert.equal(validation.valid, false);
  assert.ok(validation.issues.some((issue) => issue.code === "outside_opening_hours"));
});

test("handles group entries, available slot search, dirty state, explicit save, and revisions", async () => {
  const { schedules, root } = await makeServices();
  await schedules.createScheduleTemplate({
    scheduleType: "group",
    settings: { weekDisplay: "mon-sat", openingTime: "09:00", closingTime: "12:00", defaultSlotMinutes: 60 }
  });
  await schedules.setScheduleSlot({ scheduleType: "group", dayOfWeek: "monday", startTime: "09:00", groupTitle: "그룹 A", instructor: "지연" });
  const available = await schedules.findAvailableSlots({ scheduleType: "group", dayOfWeek: "monday", fromTime: "09:00", toTime: "12:00", duration: 60 });
  assert.deepEqual(
    available.availableSlots.map((slot) => slot.startTime),
    ["10:00", "11:00"]
  );
  const before = await schedules.getSchedule({ scheduleType: "group" });
  assert.equal(before.saveState, "dirty");
  const saved = await schedules.saveSchedule({ scheduleType: "group" });
  assert.equal(saved.success, true);
  assert.equal(saved.saveState, "saved");
  await schedules.setScheduleSlot({ scheduleType: "group", dayOfWeek: "monday", startTime: "10:00", groupTitle: "그룹 B" });
  await schedules.saveSchedule({ scheduleType: "group" });
  const revisions = await fs.readdir(path.join(root, "schedules", "group", "revisions"));
  assert.ok(revisions.some((file) => file.endsWith(".json")));
});

test("imports existing XLSX mapping, modifies values, and exports XLSX", async () => {
  const { schedules, root } = await makeServices();
  const filePath = path.join(process.cwd(), "phase2_schedule_import_test.xlsx");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("GROUP");
  sheet.addRows([
    ["시간", "월", "화"],
    ["09:00", "그룹 A", ""],
    ["10:00", "", "그룹 B"]
  ]);
  sheet.getColumn(1).width = 10;
  sheet.getColumn(2).width = 18;
  sheet.getColumn(3).width = 18;
  await workbook.xlsx.writeFile(filePath);
  try {
    const imported = await schedules.importScheduleFile({ filePath, scheduleType: "group" });
    assert.equal(imported.mapping.sheetName, "GROUP");
    assert.equal(imported.mapping.dayColumns.monday, 2);
    await schedules.setScheduleSlot({ scheduleType: "group", dayOfWeek: "monday", startTime: "10:00", groupTitle: "그룹 C" });
    const exported = await schedules.exportSchedule({ scheduleType: "group" });
    assert.match(exported.filePath, /group_schedule\.xlsx$/);
    await fs.access(path.join(root, "schedules", "group", "group_schedule.xlsx"));
  } finally {
    await fs.rm(filePath, { force: true });
  }
});

test("applies holidays, center closures, priority warnings, and does not delete occupied lessons", async () => {
  const { schedules } = await makeServices();
  await schedules.createScheduleTemplate({
    scheduleType: "group",
    settings: { weekDisplay: "mon-sun", openingTime: "09:00", closingTime: "11:00", defaultSlotMinutes: 60, autoHolidayMarking: true, countryCode: "KR" }
  });
  await schedules.setScheduleSlot({ scheduleType: "group", dayOfWeek: "friday", startTime: "09:00", groupTitle: "한글날 특강" });
  const closure = await schedules.addCenterClosure({ date: "2026-10-09", label: "센터 내부 일정" });
  assert.equal(closure.requiresConfirmation, true);
  assert.ok(closure.warnings.some((warning) => warning.includes("기존 일정")));
  const generated = await schedules.generateWeeklySchedule({ scheduleType: "group", weekStart: "2026-10-05", applyHolidays: true, applyCenterClosures: true });
  const occupied = generated.slots.find((slot) => slot.date === "2026-10-09" && slot.startTime === "09:00");
  const closed = generated.slots.find((slot) => slot.date === "2026-10-09" && slot.startTime === "10:00");
  assert.equal(occupied?.status, "occupied");
  assert.equal(closed?.status, "center_closed");
});

test("privacy boundary rejects member CRM fields and private schedule posters remove display names", async () => {
  const { posters, schedules } = await makeServices();
  await schedules.createScheduleTemplate({
    scheduleType: "private",
    settings: { weekDisplay: "mon-fri", openingTime: "09:00", closingTime: "21:00", defaultSlotMinutes: 60 }
  });
  await assert.rejects(
    () => schedules.setScheduleSlot({ scheduleType: "private", dayOfWeek: "monday", startTime: "19:00", displayName: "김OO", phone: "010" } as never),
    /Forbidden member data fields/
  );
  await schedules.setScheduleSlot({ scheduleType: "private", dayOfWeek: "monday", startTime: "19:00", displayName: "김OO" });
  const poster = await schedules.createSchedulePoster({ scheduleType: "private", title: "개인 시간표 포스터", render: false });
  assert.equal((poster as { valid: boolean }).valid, true);
  const posterId = String((poster as { posterId: string }).posterId);
  const stored = await posters.getPoster(posterId);
  assert.doesNotMatch(stored.html, /김OO/);
});
