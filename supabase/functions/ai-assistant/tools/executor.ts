// Інструменти асистента (лише читання). Модель НЕ рахує сама - вона викликає
// ці функції, а всі підрахунки (розклад, статуси, відсотки) робить код.
//
// Дані користувача не змінюються жодним інструментом.

import {
  addDays, diffDays, isValidDateStr, localDateStr, localTimeStr, zonedToInstant,
} from "../domain/timezone.ts";
import {
  daysSupply, medicationState, resolveDoses, type DoseLogRow, type DoseStatus,
  type MedicationFrequency, type MedicationRow, type ResolvedDose,
} from "../domain/schedule.ts";

export interface DataSource {
  listMedications(): Promise<MedicationRow[]>;
  /** Записи dose_logs із scheduled_time у [fromIso, toIso) */
  listDoseLogs(fromIso: string, toIso: string): Promise<DoseLogRow[]>;
}

export interface ToolContext {
  tz: string;
  now: Date;
  data: DataSource;
}

export type ToolResult = { ok: true; result: unknown } | { ok: false; error: string };

export const TOOL_NAMES = ["get_medications", "get_schedule", "get_dose_logs", "get_statistics"] as const;
export type ToolName = typeof TOOL_NAMES[number];

const MAX_LOG_RANGE_DAYS = 31;
const MAX_STATS_RANGE_DAYS = 90;
const MAX_DOSES_RETURNED = 100;

const MISSED_NOTE =
  'A dose with status "missed" and recorded=false means its time has passed and the user did not ' +
  "mark it in the app. This does not prove the dose was actually skipped.";

const DOSAGE_NOTE =
  "Some dosage values are stored as plain numbers without a unit. Quote dosage exactly as given; " +
  "never add or guess units such as mg or ml.";

/** true, якщо хоч одне дозування - просто число (без одиниці виміру). */
const hasUnitlessDosage = (dosages: Array<string | null | undefined>): boolean =>
  dosages.some((d) => typeof d === "string" && /^\s*\d+(?:[.,]\d+)?\s*$/.test(d));

// ---------------------------------------------------------------- args

class ArgError extends Error {}
type Args = Record<string, unknown>;

function str(a: Args, k: string): string | undefined {
  const v = a[k];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string") throw new ArgError(`${k} must be a string`);
  const t = v.trim();
  if (t.length > 100) throw new ArgError(`${k} is too long`);
  return t === "" ? undefined : t;
}
function date(a: Args, k: string): string | undefined {
  const s = str(a, k);
  if (s !== undefined && !isValidDateStr(s)) throw new ArgError(`${k} must be a real date in YYYY-MM-DD format`);
  return s;
}
function time(a: Args, k: string): string | undefined {
  const s = str(a, k);
  if (s !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) throw new ArgError(`${k} must be HH:MM (24h)`);
  return s;
}
function oneOf<T extends string>(a: Args, k: string, allowed: readonly T[]): T | undefined {
  const s = str(a, k);
  if (s === undefined) return undefined;
  if (!(allowed as readonly string[]).includes(s)) throw new ArgError(`${k} must be one of: ${allowed.join(", ")}`);
  return s as T;
}
function bool(a: Args, k: string): boolean | undefined {
  const v = a[k];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "boolean") throw new ArgError(`${k} must be a boolean`);
  return v;
}
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

function filterMeds(meds: MedicationRow[], name: string | undefined): MedicationRow[] {
  if (!name) return meds;
  const q = name.toLocaleLowerCase("uk");
  const hit = meds.filter((m) => m.name.toLocaleLowerCase("uk").includes(q));
  if (hit.length === 0) {
    const names = meds.map((m) => m.name).join(", ") || "(user has no medications)";
    throw new ArgError(`No medication matches "${name}". Available: ${names}`);
  }
  return hit;
}

// ----------------------------------------------------------- presentation

const MEAL_UK: Record<string, string> = {
  before_meal: "до їжі", after_meal: "після їжі", with_meal: "під час їжі",
  on_empty_stomach: "натщесерце", any_time: "незалежно від їжі",
};
const WEEKDAY_SHORT_UK = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];

function describeFrequency(f: MedicationFrequency): string {
  switch (f?.type) {
    case "daily": return `щодня о ${f.time}`;
    case "interval": return `кожні ${f.hours} год, починаючи з ${f.startTime}`;
    case "custom": {
      const days = [...(f.weekdays ?? [])].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
        .map((d) => WEEKDAY_SHORT_UK[d]).join(", ");
      return `${days} о ${f.time}`;
    }
    default: return "невідомо";
  }
}

const pct = (taken: number, due: number): number | null =>
  due > 0 ? Math.round((taken / due) * 1000) / 10 : null;

function doseView(d: ResolvedDose, tz: string, withDate: boolean) {
  return {
    ...(withDate ? { date: localDateStr(d.scheduledAt, tz) } : {}),
    time: localTimeStr(d.scheduledAt, tz),
    medication: d.medicationName,
    dosage: d.dosage,
    meal_timing: d.mealTiming ? MEAL_UK[d.mealTiming] ?? d.mealTiming : null,
    status: d.status,
    recorded: d.recorded,
    ...(d.takenAt ? { taken_at: localTimeStr(d.takenAt, tz) } : {}),
  };
}

function counts(doses: ResolvedDose[]) {
  let taken = 0, missed = 0, upcoming = 0, unrecorded = 0;
  for (const d of doses) {
    if (d.status === "taken") taken++;
    else if (d.status === "missed") { missed++; if (!d.recorded) unrecorded++; }
    else upcoming++;
  }
  const due = taken + missed;
  return { scheduled: doses.length, due, taken, missed, missed_unrecorded: unrecorded, upcoming, adherence_percent: pct(taken, due) };
}

function fetchLogs(ctx: ToolContext, from: string, to: string): Promise<DoseLogRow[]> {
  return ctx.data.listDoseLogs(
    zonedToInstant(from, "00:00", ctx.tz).toISOString(),
    zonedToInstant(addDays(to, 1), "00:00", ctx.tz).toISOString(),
  );
}

// ----------------------------------------------------------------- tools

async function getMedications(a: Args, ctx: ToolContext) {
  const includeInactive = bool(a, "include_inactive") ?? false;
  const today = localDateStr(ctx.now, ctx.tz);
  const meds = await ctx.data.listMedications();
  const withState = meds.map((m) => ({ m, state: medicationState(m, today) }));

  const rows = withState
    .filter((x) => includeInactive || x.state === "active")
    .sort((x, y) => x.m.name.localeCompare(y.m.name, "uk"))
    .map(({ m, state }) => {
      const supply = daysSupply(m);
      return {
        name: m.name,
        dosage: m.dosage ?? null,
        schedule: describeFrequency(m.frequency),
        meal_timing: MEAL_UK[m.meal_timing ?? "any_time"] ?? m.meal_timing,
        start_date: m.start_date.slice(0, 10),
        end_date: m.end_date ? m.end_date.slice(0, 10) : null,
        state,
        reminders_enabled: m.reminder_enabled ?? true,
        notes: m.notes ? m.notes.slice(0, 200) : null,
        stock: m.stock_quantity == null ? null : {
          quantity: m.stock_quantity, unit: m.stock_unit ?? null,
          dose_per_intake: m.dose_per_intake ?? null, estimated_days_left: supply,
        },
      };
    });

  // Приховані препарати: модель має знати, що вони існують
  // (наприклад, на питання "які ліки в мене заплановані").
  const notStarted = withState
    .filter((x) => x.state === "not_started")
    .sort((x, y) => x.m.start_date.localeCompare(y.m.start_date))
    .map((x) => ({ name: x.m.name, starts_on: x.m.start_date.slice(0, 10) }));
  const finishedCount = withState.filter((x) => x.state === "finished").length;
  const hasHidden = !includeInactive && (notStarted.length > 0 || finishedCount > 0);

  const notes: string[] = [];
  if (hasUnitlessDosage(rows.map((r) => r.dosage))) notes.push(DOSAGE_NOTE);
  if (rows.length === 0) {
    notes.push(
      includeInactive
        ? "The user has no medications."
        : "No active medications right now.",
    );
  }
  if (hasHidden) {
    notes.push(
      "Some medications are not listed because they have not started yet or are finished (see hidden). " +
        "Mention not-started ones if the user asks about planned or upcoming medications; " +
        "use include_inactive=true for the full list.",
    );
  }

  return {
    today,
    count: rows.length,
    medications: rows,
    ...(hasHidden ? { hidden: { not_started: notStarted, finished_count: finishedCount } } : {}),
    ...(notes.length ? { notes } : {}),
  };
}

const PARTS: Record<string, [number, number]> = {
  morning: [5 * 60, 11 * 60 + 59], afternoon: [12 * 60, 17 * 60 + 59],
  evening: [18 * 60, 23 * 60 + 59], night: [0, 5 * 60 - 1],
};

async function getSchedule(a: Args, ctx: ToolContext) {
  const today = localDateStr(ctx.now, ctx.tz);
  const day = date(a, "date") ?? today;
  const part = oneOf(a, "part_of_day", ["morning", "afternoon", "evening", "night"] as const);
  const fromT = time(a, "from_time");
  const toT = time(a, "to_time");

  let lo = 0, hi = 24 * 60 - 1;
  if (part) [lo, hi] = PARTS[part];
  if (fromT) lo = toMin(fromT);
  if (toT) hi = toMin(toT);
  if (lo > hi) throw new ArgError("from_time must not be later than to_time");

  const meds = await ctx.data.listMedications();
  const logs = await fetchLogs(ctx, day, day);
  const doses = resolveDoses(meds, logs, day, day, ctx.tz, ctx.now).filter((d) => {
    const m = toMin(localTimeStr(d.scheduledAt, ctx.tz));
    return m >= lo && m <= hi;
  });

  const c = counts(doses);
  const notes: string[] = [];
  if (c.missed_unrecorded > 0) notes.push(MISSED_NOTE);
  if (hasUnitlessDosage(doses.map((d) => d.dosage))) notes.push(DOSAGE_NOTE);
  if (doses.length === 0) notes.push("No doses are scheduled in this window.");
  return {
    date: day,
    now_local: `${today} ${localTimeStr(ctx.now, ctx.tz)}`,
    window: { part_of_day: part ?? null, from: fromT ?? null, to: toT ?? null },
    summary: { total: c.scheduled, taken: c.taken, missed: c.missed, pending: c.upcoming },
    doses: doses.map((d) => doseView(d, ctx.tz, false)),
    notes,
  };
}

function range(a: Args, defaults: [string, string], maxDays: number): [string, string] {
  const from = date(a, "from_date") ?? defaults[0];
  const to = date(a, "to_date") ?? defaults[1];
  if (from > to) throw new ArgError("from_date must not be later than to_date");
  if (diffDays(from, to) + 1 > maxDays) throw new ArgError(`Date range is too long (max ${maxDays} days)`);
  return [from, to];
}

async function getDoseLogs(a: Args, ctx: ToolContext) {
  const today = localDateStr(ctx.now, ctx.tz);
  const [from, to] = range(a, [addDays(today, -6), today], MAX_LOG_RANGE_DAYS);
  const status = oneOf(a, "status", ["taken", "missed", "pending", "all"] as const) ?? "all";
  const name = str(a, "medication_name");

  const meds = filterMeds(await ctx.data.listMedications(), name);
  const logs = await fetchLogs(ctx, from, to);
  const all = resolveDoses(meds, logs, from, to, ctx.tz, ctx.now);
  const shown = status === "all" ? all : all.filter((d) => d.status === (status as DoseStatus));
  const truncated = shown.length > MAX_DOSES_RETURNED;
  const list = truncated ? shown.slice(-MAX_DOSES_RETURNED) : shown;

  const c = counts(all);
  return {
    period: { from, to }, filter: { status, medication: name ?? null },
    totals_in_period: { scheduled: c.scheduled, taken: c.taken, missed: c.missed, pending: c.upcoming },
    matched: shown.length, truncated, doses: list.map((d) => doseView(d, ctx.tz, true)),
    notes: [
      ...(c.missed_unrecorded > 0 ? [MISSED_NOTE] : []),
      ...(hasUnitlessDosage(list.map((d) => d.dosage)) ? [DOSAGE_NOTE] : []),
      ...(truncated ? [`Only the most recent ${MAX_DOSES_RETURNED} doses are shown.`] : []),
    ],
  };
}

const PERIODS = ["today", "yesterday", "last_7_days", "last_30_days"] as const;

async function getStatistics(a: Args, ctx: ToolContext) {
  const today = localDateStr(ctx.now, ctx.tz);
  const period = oneOf(a, "period", PERIODS);
  const custom = a["from_date"] !== undefined || a["to_date"] !== undefined;

  let from: string, to: string;
  if (custom) {
    [from, to] = range(a, [today, today], MAX_STATS_RANGE_DAYS);
  } else {
    switch (period ?? "last_7_days") {
      case "today": [from, to] = [today, today]; break;
      case "yesterday": [from, to] = [addDays(today, -1), addDays(today, -1)]; break;
      case "last_30_days": [from, to] = [addDays(today, -29), today]; break;
      default: [from, to] = [addDays(today, -6), today];
    }
  }
  const name = str(a, "medication_name");
  const meds = filterMeds(await ctx.data.listMedications(), name);
  const logs = await fetchLogs(ctx, from, to);
  const doses = resolveDoses(meds, logs, from, to, ctx.tz, ctx.now);
  const days = diffDays(from, to) + 1;

  const byMed = meds.map((m) => {
    const c = counts(doses.filter((d) => d.medicationId === m.id));
    return { medication: m.name, ...c };
  }).filter((x) => x.scheduled > 0);

  const byDay = days <= 14
    ? Array.from({ length: days }, (_, i) => {
      const d = addDays(from, i);
      const c = counts(doses.filter((x) => localDateStr(x.scheduledAt, ctx.tz) === d));
      return { date: d, scheduled: c.scheduled, taken: c.taken, missed: c.missed, upcoming: c.upcoming };
    })
    : undefined;

  const totals = counts(doses);
  return {
    period: { from, to, days }, medication_filter: name ?? null,
    totals, by_medication: byMed, ...(byDay ? { by_day: byDay } : {}),
    notes: [
      "adherence_percent = taken / due. 'due' = doses whose time has already passed; 'upcoming' doses are not counted.",
      ...(totals.missed_unrecorded > 0 ? [MISSED_NOTE] : []),
      ...(totals.scheduled === 0 ? ["No doses were scheduled in this period."] : []),
    ],
  };
}

// ------------------------------------------------------------- dispatcher

const HANDLERS: Record<ToolName, (a: Args, c: ToolContext) => Promise<unknown>> = {
  get_medications: getMedications,
  get_schedule: getSchedule,
  get_dose_logs: getDoseLogs,
  get_statistics: getStatistics,
};

export async function executeTool(name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolResult> {
  if (!(TOOL_NAMES as readonly string[]).includes(name)) {
    return { ok: false, error: `Unknown tool "${name}". Available: ${TOOL_NAMES.join(", ")}` };
  }
  if (rawArgs !== undefined && rawArgs !== null && (typeof rawArgs !== "object" || Array.isArray(rawArgs))) {
    return { ok: false, error: "Tool arguments must be an object" };
  }
  try {
    const result = await HANDLERS[name as ToolName]((rawArgs ?? {}) as Args, ctx);
    return { ok: true, result };
  } catch (e) {
    if (e instanceof ArgError) return { ok: false, error: e.message };
    // Деталі (можливо з даними) не віддаємо моделі й не логуємо
    console.error("tool error:", name, e instanceof Error ? e.name : "unknown");
    return { ok: false, error: "Internal error while reading the user's data." };
  }
}