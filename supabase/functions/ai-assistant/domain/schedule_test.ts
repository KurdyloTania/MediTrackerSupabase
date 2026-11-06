// Запуск: deno test --config deno.json domain/
import { assertEquals } from "../testing.ts";
import {
  addDays, diffDays, isValidDateStr, localDateStr, localTimeStr, weekdayOf, zonedToInstant,
} from "./timezone.ts";
import {
  daysSupply, dosesForDate, medicationState, resolveDoses, type DoseLogRow, type MedicationRow,
} from "./schedule.ts";

const KYIV = "Europe/Kyiv";
const iso = (d: Date) => d.toISOString();

const baseMed = (over: Partial<MedicationRow>): MedicationRow => ({
  id: "m1", name: "Тест", frequency: { type: "daily", time: "08:00" },
  start_date: "2026-01-01", ...over,
});

// ---------- timezone ----------

Deno.test("zonedToInstant: зима (UTC+2) і літо (UTC+3)", () => {
  assertEquals(iso(zonedToInstant("2026-11-02", "08:00", KYIV)), "2026-11-02T06:00:00.000Z");
  assertEquals(iso(zonedToInstant("2026-07-01", "08:00", KYIV)), "2026-07-01T05:00:00.000Z");
});

Deno.test("zonedToInstant: перехід на літній час 29.03.2026 (03:30 не існує -> 04:30)", () => {
  assertEquals(iso(zonedToInstant("2026-03-29", "02:00", KYIV)), "2026-03-29T00:00:00.000Z");
  assertEquals(iso(zonedToInstant("2026-03-29", "05:00", KYIV)), "2026-03-29T02:00:00.000Z");
  assertEquals(localTimeStr(zonedToInstant("2026-03-29", "03:30", KYIV), KYIV), "04:30");
});

Deno.test("zonedToInstant: перехід на зимовий час 25.10.2026", () => {
  assertEquals(iso(zonedToInstant("2026-10-25", "12:00", KYIV)), "2026-10-25T10:00:00.000Z");
  assertEquals(iso(zonedToInstant("2026-10-24", "12:00", KYIV)), "2026-10-24T09:00:00.000Z");
});

Deno.test("localDateStr / localTimeStr: UTC-вечір = уже наступна доба в Києві", () => {
  const t = new Date("2026-11-02T22:30:00Z");
  assertEquals(localDateStr(t, KYIV), "2026-11-03");
  assertEquals(localTimeStr(t, KYIV), "00:30");
  assertEquals(localDateStr(t, "UTC"), "2026-11-02");
});

Deno.test("зворотність: instant -> локальні дата/час -> instant", () => {
  for (const tz of [KYIV, "America/New_York", "Asia/Tokyo", "UTC"]) {
    const t = new Date("2026-06-15T13:45:00Z");
    assertEquals(iso(zonedToInstant(localDateStr(t, tz), localTimeStr(t, tz), tz)), iso(t));
  }
});

Deno.test("дата-хелпери", () => {
  assertEquals(addDays("2026-02-28", 1), "2026-03-01");
  assertEquals(addDays("2026-01-01", -1), "2025-12-31");
  assertEquals(diffDays("2026-10-25", "2026-11-02"), 8);
  assertEquals(weekdayOf("2026-11-02"), 1); // понеділок
  assertEquals(weekdayOf("2026-11-01"), 0); // неділя
  assertEquals(isValidDateStr("2026-02-30"), false);
  assertEquals(isValidDateStr("2026-2-3"), false);
  assertEquals(isValidDateStr("2024-02-29"), true);
});

// ---------- розклад ----------

Deno.test("daily: одна доза на день", () => {
  const r = dosesForDate(baseMed({}), "2026-11-02", KYIV);
  assertEquals(r.map((d) => localTimeStr(d, KYIV)), ["08:00"]);
});

Deno.test("custom: лише у вибрані дні (0 = неділя)", () => {
  const med = baseMed({ frequency: { type: "custom", weekdays: [1, 3], time: "09:30" } });
  assertEquals(dosesForDate(med, "2026-11-02", KYIV).length, 1); // пн
  assertEquals(dosesForDate(med, "2026-11-03", KYIV).length, 0); // вт
  assertEquals(dosesForDate(med, "2026-11-04", KYIV).length, 1); // ср
});

Deno.test("interval 8 год від 08:00 -> 08:00 і 16:00 (24:00 уже наступна доба)", () => {
  const med = baseMed({ frequency: { type: "interval", hours: 8, startTime: "08:00" } });
  assertEquals(dosesForDate(med, "2026-11-02", KYIV).map((d) => localTimeStr(d, KYIV)), ["08:00", "16:00"]);
});

Deno.test("interval 6 год від 06:00 -> 06:00, 12:00, 18:00", () => {
  const med = baseMed({ frequency: { type: "interval", hours: 6, startTime: "06:00" } });
  assertEquals(dosesForDate(med, "2026-11-02", KYIV).map((d) => localTimeStr(d, KYIV)), ["06:00", "12:00", "18:00"]);
});

Deno.test("interval у день переходу на літній час не зациклюється", () => {
  const med = baseMed({ frequency: { type: "interval", hours: 8, startTime: "00:00" } });
  assertEquals(dosesForDate(med, "2026-03-29", KYIV).map((d) => localTimeStr(d, KYIV)), ["00:00", "09:00", "17:00"]);
});

Deno.test("interval з hours <= 0 не зациклюється (у застосунку був би вічний цикл)", () => {
  const med = baseMed({ frequency: { type: "interval", hours: 0, startTime: "08:00" } });
  assertEquals(dosesForDate(med, "2026-11-02", KYIV).length, 1);
});

Deno.test("поза межами start_date / end_date доз немає; межі включно", () => {
  const med = baseMed({ start_date: "2026-11-02", end_date: "2026-11-04" });
  assertEquals(dosesForDate(med, "2026-11-01", KYIV).length, 0);
  assertEquals(dosesForDate(med, "2026-11-02", KYIV).length, 1);
  assertEquals(dosesForDate(med, "2026-11-04", KYIV).length, 1);
  assertEquals(dosesForDate(med, "2026-11-05", KYIV).length, 0);
});

Deno.test("пошкоджена frequency не ламає розклад", () => {
  // deno-lint-ignore no-explicit-any
  const bad = baseMed({ frequency: { type: "weird" } as any });
  assertEquals(dosesForDate(bad, "2026-11-02", KYIV), []);
  // deno-lint-ignore no-explicit-any
  const bad2 = baseMed({ frequency: null as any });
  assertEquals(dosesForDate(bad2, "2026-11-02", KYIV), []);
});

Deno.test("medicationState", () => {
  assertEquals(medicationState(baseMed({ start_date: "2026-12-01" }), "2026-11-02"), "not_started");
  assertEquals(medicationState(baseMed({ end_date: "2026-11-01" }), "2026-11-02"), "finished");
  assertEquals(medicationState(baseMed({ end_date: "2026-11-02" }), "2026-11-02"), "active");
  assertEquals(medicationState(baseMed({}), "2026-11-02"), "active");
});

// ---------- статуси ----------

const NOW = new Date("2026-11-02T13:21:00Z"); // 15:21 у Києві

Deno.test("resolveDoses: taken / missed без запису / pending", () => {
  const meds = [
    baseMed({ id: "a", name: "A", frequency: { type: "daily", time: "08:00" } }),
    baseMed({ id: "b", name: "B", frequency: { type: "daily", time: "09:00" } }),
    baseMed({ id: "c", name: "C", frequency: { type: "daily", time: "21:00" } }),
  ];
  const logs: DoseLogRow[] = [
    { medication_id: "a", scheduled_time: "2026-11-02T06:00:00+00:00", taken_at: "2026-11-02T06:05:00Z", status: "taken" },
  ];
  const r = resolveDoses(meds, logs, "2026-11-02", "2026-11-02", KYIV, NOW);
  assertEquals(r.map((d) => [d.medicationName, d.status, d.recorded]), [
    ["A", "taken", true], ["B", "missed", false], ["C", "pending", false],
  ]);
});

Deno.test("resolveDoses: формат часу в логу ('Z' чи '+00:00') не має значення", () => {
  const meds = [baseMed({ id: "a", name: "A" })];
  for (const t of ["2026-11-02T06:00:00Z", "2026-11-02T06:00:00.000Z", "2026-11-02T06:00:00+00:00", "2026-11-02T08:00:00+02:00"]) {
    const r = resolveDoses(meds, [{ medication_id: "a", scheduled_time: t, taken_at: null, status: "taken" }],
      "2026-11-02", "2026-11-02", KYIV, NOW);
    assertEquals(r[0].status, "taken", t);
  }
});

Deno.test("resolveDoses: явний запис missed лишається missed (recorded=true), pending у минулому -> missed", () => {
  const meds = [baseMed({ id: "a", name: "A" })];
  const missed = resolveDoses(meds, [{ medication_id: "a", scheduled_time: "2026-11-02T06:00:00Z", taken_at: null, status: "missed" }],
    "2026-11-02", "2026-11-02", KYIV, NOW);
  assertEquals([missed[0].status, missed[0].recorded], ["missed", true]);
  const pend = resolveDoses(meds, [{ medication_id: "a", scheduled_time: "2026-11-02T06:00:00Z", taken_at: null, status: "pending" }],
    "2026-11-02", "2026-11-02", KYIV, NOW);
  assertEquals([pend[0].status, pend[0].recorded], ["missed", false]);
});

Deno.test("resolveDoses: сортування за часом, кілька днів", () => {
  const meds = [
    baseMed({ id: "a", name: "A", frequency: { type: "daily", time: "20:00" } }),
    baseMed({ id: "b", name: "B", frequency: { type: "daily", time: "07:00" } }),
  ];
  const r = resolveDoses(meds, [], "2026-11-01", "2026-11-02", KYIV, NOW);
  assertEquals(r.map((d) => `${localDateStr(d.scheduledAt, KYIV)} ${d.medicationName}`),
    ["2026-11-01 B", "2026-11-01 A", "2026-11-02 B", "2026-11-02 A"]);
});

Deno.test("daysSupply (порт calcDaysSupply)", () => {
  assertEquals(daysSupply(baseMed({ stock_quantity: 30, dose_per_intake: 1 })), 30);
  assertEquals(daysSupply(baseMed({ stock_quantity: 30, dose_per_intake: 2 })), 15);
  assertEquals(daysSupply(baseMed({ frequency: { type: "interval", hours: 8, startTime: "08:00" }, stock_quantity: 30, dose_per_intake: 1 })), 10);
  assertEquals(daysSupply(baseMed({ frequency: { type: "custom", weekdays: [1, 3], time: "08:00" }, stock_quantity: 10, dose_per_intake: 1 })), 35);
  assertEquals(daysSupply(baseMed({})), null);
});