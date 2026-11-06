// Запуск: deno test --config deno.json tools/
import { assert, assertEquals } from "../testing.ts";
import { type DataSource, executeTool, type ToolContext } from "./executor.ts";
import { toolDefinitions } from "./definitions.ts";
import type { DoseLogRow, MedicationRow } from "../domain/schedule.ts";

const NOW = new Date("2026-11-02T13:21:00Z"); // понеділок, 15:21 Київ

const MEDS: MedicationRow[] = [
  { id: "A", name: "Метформін", dosage: "500 мг", frequency: { type: "daily", time: "08:00" },
    start_date: "2026-10-01", meal_timing: "with_meal", stock_quantity: 60, stock_unit: "таб", dose_per_intake: 1 },
  { id: "B", name: "Омепразол", dosage: "20 мг", frequency: { type: "daily", time: "21:00" },
    start_date: "2026-10-01", meal_timing: "on_empty_stomach" },
  { id: "C", name: "Вітамін D", dosage: "1000 МО", frequency: { type: "custom", weekdays: [1, 3, 5], time: "09:00" },
    start_date: "2026-10-01" },
  { id: "D", name: "Антибіотик", dosage: "250 мг", frequency: { type: "interval", hours: 8, startTime: "08:00" },
    start_date: "2026-10-10", end_date: "2026-10-16" },
];
const LOGS: DoseLogRow[] = [
  { medication_id: "A", scheduled_time: "2026-11-02T06:00:00+00:00", taken_at: "2026-11-02T06:10:00+00:00", status: "taken" },
];

function ctx(over: Partial<DataSource> = {}): ToolContext {
  const calls: string[][] = [];
  const data: DataSource = {
    listMedications: () => Promise.resolve(MEDS),
    listDoseLogs: (f, t) => { calls.push([f, t]); return Promise.resolve(LOGS); },
    ...over,
  };
  return { tz: "Europe/Kyiv", now: NOW, data };
}
// deno-lint-ignore no-explicit-any
async function ok(name: string, args: unknown, c = ctx()): Promise<any> {
  const r = await executeTool(name, args, c);
  if (!r.ok) throw new Error(`очікувався успіх, а отримано помилку: ${r.error}`);
  return r.result;
}
async function err(name: string, args: unknown, c = ctx()): Promise<string> {
  const r = await executeTool(name, args, c);
  if (r.ok) throw new Error("очікувалась помилка");
  return r.error;
}

// ---------- get_schedule ----------

Deno.test("get_schedule: сьогодні - taken / missed(unrecorded) / pending", async () => {
  const r = await ok("get_schedule", {});
  assertEquals(r.date, "2026-11-02");
  assertEquals(r.now_local, "2026-11-02 15:21");
  assertEquals(r.doses.map((d: { time: string; medication: string; status: string; recorded: boolean }) =>
    [d.time, d.medication, d.status, d.recorded]),
    [["08:00", "Метформін", "taken", true], ["09:00", "Вітамін D", "missed", false], ["21:00", "Омепразол", "pending", false]]);
  assertEquals(r.summary, { total: 3, taken: 1, missed: 1, pending: 1 });
  assert(r.notes.some((n: string) => n.includes("does not prove")), "є застереження про unrecorded");
});

Deno.test("get_schedule: ввечері -> лише Омепразол", async () => {
  const r = await ok("get_schedule", { part_of_day: "evening" });
  assertEquals(r.doses.map((d: { medication: string }) => d.medication), ["Омепразол"]);
  assertEquals(r.doses[0].meal_timing, "натщесерце");
});

Deno.test("get_schedule: явний діапазон часу перекриває part_of_day", async () => {
  const r = await ok("get_schedule", { part_of_day: "evening", from_time: "08:30", to_time: "09:30" });
  assertEquals(r.doses.map((d: { medication: string }) => d.medication), ["Вітамін D"]);
});

Deno.test("get_schedule: завтра (вівторок) - Вітаміну D немає, усе pending", async () => {
  const r = await ok("get_schedule", { date: "2026-11-03" });
  assertEquals(r.doses.map((d: { medication: string; status: string }) => [d.medication, d.status]),
    [["Метформін", "pending"], ["Омепразол", "pending"]]);
});

Deno.test("get_schedule: запит логів обмежений саме цією локальною добою (UTC+2)", async () => {
  const calls: string[][] = [];
  await ok("get_schedule", {}, ctx({ listDoseLogs: (f, t) => { calls.push([f, t]); return Promise.resolve([]); } }));
  assertEquals(calls, [["2026-11-01T22:00:00.000Z", "2026-11-02T22:00:00.000Z"]]);
});

Deno.test("get_schedule: порожнє вікно дає пояснення, а не помилку", async () => {
  const r = await ok("get_schedule", { part_of_day: "night" });
  assertEquals(r.doses, []);
  assert(r.notes.some((n: string) => n.includes("No doses")));
});

Deno.test("get_schedule: некоректні аргументи -> помилка для моделі", async () => {
  assert((await err("get_schedule", { date: "2026-02-30" })).includes("YYYY-MM-DD"));
  assert((await err("get_schedule", { from_time: "25:00" })).includes("HH:MM"));
  assert((await err("get_schedule", { part_of_day: "lunch" })).includes("one of"));
  assert((await err("get_schedule", { from_time: "20:00", to_time: "10:00" })).includes("later"));
  assert((await err("get_schedule", { date: 20261102 })).includes("string"));
});

// ---------- get_medications ----------

Deno.test("get_medications: за замовчуванням лише активні, з описом розкладу", async () => {
  const r = await ok("get_medications", {});
  assertEquals(r.medications.map((m: { name: string }) => m.name), ["Вітамін D", "Метформін", "Омепразол"]);
  const c = r.medications.find((m: { name: string }) => m.name === "Вітамін D");
  assertEquals(c.schedule, "пн, ср, пт о 09:00");
  const a = r.medications.find((m: { name: string }) => m.name === "Метформін");
  assertEquals(a.stock, { quantity: 60, unit: "таб", dose_per_intake: 1, estimated_days_left: 60 });
  assertEquals(a.meal_timing, "під час їжі");
});

Deno.test("get_medications: include_inactive показує завершені", async () => {
  const r = await ok("get_medications", { include_inactive: true });
  const d = r.medications.find((m: { name: string }) => m.name === "Антибіотик");
  assertEquals([d.state, d.schedule], ["finished", "кожні 8 год, починаючи з 08:00"]);
});

Deno.test("get_medications: приховані препарати (ще не почався / завершений) згадуються у hidden", async () => {
  const future: MedicationRow = {
    id: "P", name: "Папаверин", frequency: { type: "daily", time: "09:00" }, start_date: "2026-11-07",
  };
  const c = ctx({ listMedications: () => Promise.resolve([...MEDS, future]) });
  const r = await ok("get_medications", {}, c);
  assertEquals(r.count, 3); // активні: Вітамін D, Метформін, Омепразол
  assertEquals(r.hidden, {
    not_started: [{ name: "Папаверин", starts_on: "2026-11-07" }],
    finished_count: 1, // Антибіотик
  });
  assert(r.notes.some((n: string) => n.includes("not started")), "є примітка про приховані");
});

Deno.test("get_medications: include_inactive=true - поля hidden немає, препарат ще не розпочатий видно зі станом", async () => {
  const future: MedicationRow = {
    id: "P", name: "Папаверин", frequency: { type: "daily", time: "09:00" }, start_date: "2026-11-07",
  };
  const c = ctx({ listMedications: () => Promise.resolve([...MEDS, future]) });
  const r = await ok("get_medications", { include_inactive: true }, c);
  assertEquals(r.hidden, undefined);
  const p = r.medications.find((m: { name: string }) => m.name === "Папаверин");
  assertEquals(p.state, "not_started");
});

Deno.test("get_medications: лише неактивні -> 'немає активних' + hidden", async () => {
  const c = ctx({ listMedications: () => Promise.resolve([MEDS[3]]) }); // завершений антибіотик
  const r = await ok("get_medications", {}, c);
  assertEquals(r.count, 0);
  assertEquals(r.hidden.finished_count, 1);
  assertEquals(r.notes.length, 2);
});

Deno.test("get_medications: у користувача немає ліків", async () => {
  const r = await ok("get_medications", {}, ctx({ listMedications: () => Promise.resolve([]) }));
  assertEquals(r.count, 0);
  assert(r.notes.length === 1);
});

Deno.test("get_medications: нотатки обрізаються до 200 символів", async () => {
  const c = ctx({ listMedications: () => Promise.resolve([{ ...MEDS[0], notes: "я".repeat(500) }]) });
  const r = await ok("get_medications", {}, c);
  assertEquals(r.medications[0].notes.length, 200);
});

// ---------- get_statistics ----------

Deno.test("get_statistics: today", async () => {
  const r = await ok("get_statistics", { period: "today" });
  assertEquals(r.totals, { scheduled: 3, due: 2, taken: 1, missed: 1, missed_unrecorded: 1, upcoming: 1, adherence_percent: 50 });
});

Deno.test("get_statistics: last_7_days (за замовчуванням) - перевірено вручну", async () => {
  // A: 7 доз (due 7, taken 1); B: 7 (due 6); C (пн/ср/пт): 3 (due 3); D завершений - 0
  const r = await ok("get_statistics", {});
  assertEquals(r.period, { from: "2026-10-27", to: "2026-11-02", days: 7 });
  assertEquals(r.totals.scheduled, 17);
  assertEquals(r.totals.due, 16);
  assertEquals(r.totals.taken, 1);
  assertEquals(r.totals.upcoming, 1);
  assertEquals(r.totals.adherence_percent, 6.3);
  assertEquals(r.by_day.length, 7);
  assertEquals(r.by_medication.map((m: { medication: string; scheduled: number }) => [m.medication, m.scheduled]),
    [["Метформін", 7], ["Омепразол", 7], ["Вітамін D", 3]]);
});

Deno.test("get_statistics: фільтр за препаратом (частина назви, регістр не важливий)", async () => {
  const r = await ok("get_statistics", { period: "today", medication_name: "МЕТФОР" });
  assertEquals(r.totals.scheduled, 1);
  assertEquals(r.totals.adherence_percent, 100);
});

Deno.test("get_statistics: невідомий препарат -> помилка зі списком доступних", async () => {
  const e = await err("get_statistics", { medication_name: "Аспірин" });
  assert(e.includes("Аспірин") && e.includes("Метформін"));
});

Deno.test("get_statistics: 30 днів - без by_day; діапазон > 90 днів відхиляється", async () => {
  const r = await ok("get_statistics", { period: "last_30_days" });
  assertEquals(r.by_day, undefined);
  assert((await err("get_statistics", { from_date: "2026-01-01", to_date: "2026-11-02" })).includes("too long"));
  assert((await err("get_statistics", { from_date: "2026-11-02", to_date: "2026-11-01" })).includes("later"));
});

Deno.test("get_statistics: період без доз -> adherence null, а не ділення на нуль", async () => {
  const r = await ok("get_statistics", { period: "today" }, ctx({ listMedications: () => Promise.resolve([MEDS[3]]) }));
  assertEquals(r.totals.scheduled, 0);
  assertEquals(r.totals.adherence_percent, null);
});

// ---------- get_dose_logs ----------

Deno.test("get_dose_logs: status=taken -> одна доза", async () => {
  const r = await ok("get_dose_logs", { status: "taken" });
  assertEquals(r.matched, 1);
  assertEquals(r.doses[0].medication, "Метформін");
  assertEquals(r.doses[0].taken_at, "08:10");
  assertEquals(r.doses[0].date, "2026-11-02");
});

Deno.test("get_dose_logs: missed за тиждень містить нефіксовані пропуски", async () => {
  const r = await ok("get_dose_logs", { status: "missed" });
  assertEquals(r.totals_in_period.taken, 1);
  assertEquals(r.matched, r.totals_in_period.missed);
  assert(r.doses.every((d: { status: string }) => d.status === "missed"));
});

Deno.test("get_dose_logs: обмеження 100 записів (лишаються найновіші) і діапазону 31 день", async () => {
  // додатковий препарат кожні 6 год -> 3 дози/добу, разом понад 100 за 31 день
  const extra: MedicationRow = { id: "E", name: "Тест6", frequency: { type: "interval", hours: 6, startTime: "06:00" }, start_date: "2026-10-01" };
  const c = ctx({ listMedications: () => Promise.resolve([...MEDS, extra]) });
  const r = await ok("get_dose_logs", { from_date: "2026-10-03", to_date: "2026-11-02", status: "all" }, c);
  assertEquals(r.doses.length, 100);
  assertEquals(r.truncated, true);
  assert(r.matched > 100);
  assertEquals(r.doses[99].date, "2026-11-02"); // останній запис - найновіший
  assert((await err("get_dose_logs", { from_date: "2026-09-01", to_date: "2026-11-02" })).includes("too long"));
});

// ---------- загальне ----------

Deno.test("невідомий інструмент / аргументи не об'єкт", async () => {
  assert((await err("delete_everything", {})).includes("Unknown tool"));
  assert((await err("get_schedule", "date=today")).includes("object"));
  assert((await err("get_schedule", [1])).includes("object"));
  await ok("get_schedule", null);
  await ok("get_schedule", undefined);
});

Deno.test("зайві/невідомі аргументи ігноруються (не ламають і не впливають)", async () => {
  const r = await ok("get_schedule", { user_id: "hacker", sql: "drop table" });
  assertEquals(r.summary.total, 3);
});

Deno.test("збій БД -> загальна помилка без деталей", async () => {
  const e = await err("get_schedule", {}, ctx({ listMedications: () => Promise.reject(new Error("password=secret host=db")) }));
  assert(!e.includes("secret"));
  assert(e.includes("Internal error"));
});

Deno.test("опис інструментів збігається з реалізацією", () => {
  assertEquals(toolDefinitions.map((t) => t.name), ["get_medications", "get_schedule", "get_dose_logs", "get_statistics"]);
});