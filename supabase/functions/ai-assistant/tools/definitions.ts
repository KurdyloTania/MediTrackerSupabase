// Опис інструментів для моделі (JSON Schema). На етапі 4 підключимо до Gemini
// (за потреби підлаштуємо регістр типів під формат API).
// Описи англійською: моделі так надійніше обирають інструмент; відповідь
// користувачу все одно буде українською (задамо в системному промпті).

const DATE = { type: "string", description: "Calendar date YYYY-MM-DD in the user's local time zone." };
const MED_NAME = { type: "string", description: "Medication name or part of it (case-insensitive)." };

export const toolDefinitions = [
  {
    name: "get_medications",
    description:
      "List the user's medications with dosage, schedule, meal timing, dates, notes and stock. " +
      "Use for questions like 'what do I take?'. Active medications only unless include_inactive is true; medications that have not started yet or are finished are summarized in the 'hidden' field.",
    parameters: {
      type: "object",
      properties: {
        include_inactive: { type: "boolean", description: "Also return finished and not-yet-started medications." },
      },
    },
  },
  {
    name: "get_schedule",
    description:
      "Doses scheduled for ONE day with status (taken / missed / pending). Use for 'what should I take today / " +
      "this evening / tomorrow' and 'did I take everything today'. Defaults to today.",
    parameters: {
      type: "object",
      properties: {
        date: DATE,
        part_of_day: { type: "string", enum: ["morning", "afternoon", "evening", "night"], description: "morning 05:00-11:59, afternoon 12:00-17:59, evening 18:00-23:59, night 00:00-04:59." },
        from_time: { type: "string", description: "HH:MM 24h, start of window (overrides part_of_day start)." },
        to_time: { type: "string", description: "HH:MM 24h, end of window (overrides part_of_day end)." },
      },
    },
  },
  {
    name: "get_dose_logs",
    description:
      "Dose history over a date range (max 31 days) with status per dose. Use for 'did I miss anything this week', " +
      "'when did I last take X'. Defaults to the last 7 days.",
    parameters: {
      type: "object",
      properties: {
        from_date: DATE, to_date: DATE,
        status: { type: "string", enum: ["taken", "missed", "pending", "all"] },
        medication_name: MED_NAME,
      },
    },
  },
  {
    name: "get_statistics",
    description:
      "Adherence statistics: counts of scheduled / taken / missed doses and adherence percent, overall and per medication. " +
      "Use for 'how well am I following my regimen'. Always use this instead of computing percentages yourself.",
    parameters: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["today", "yesterday", "last_7_days", "last_30_days"], description: "Preset period. Default last_7_days." },
        from_date: DATE, to_date: DATE,
        medication_name: MED_NAME,
      },
    },
  },
] as const;