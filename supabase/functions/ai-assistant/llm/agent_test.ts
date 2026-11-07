// Запуск: deno test --config deno.json llm/
import { assert, assertEquals } from "../testing.ts";
import {
  FALLBACK_NO_ANSWER, FALLBACK_TOO_MANY, MAX_LLM_CALLS, MAX_REPLY_CHARS, MAX_TOOL_CALLS, runAgent,
} from "./agent.ts";
import { functionCall, modelText, scriptedLlm } from "./test_helpers.ts";
import { LlmError } from "./types.ts";
import type { DataSource } from "../tools/executor.ts";
import type { DoseLogRow, MedicationRow } from "../domain/schedule.ts";

const NOW = new Date("2026-11-02T13:21:00Z"); // понеділок 15:21 Київ
const MEDS: MedicationRow[] = [
  { id: "A", name: "Метформін", dosage: "500 мг", frequency: { type: "daily", time: "08:00" }, start_date: "2026-10-01" },
  { id: "B", name: "Омепразол", dosage: "20 мг", frequency: { type: "daily", time: "21:00" }, start_date: "2026-10-01" },
];
const LOGS: DoseLogRow[] = [
  { medication_id: "A", scheduled_time: "2026-11-02T06:00:00+00:00", taken_at: "2026-11-02T06:10:00+00:00", status: "taken" },
];
const data: DataSource = {
  listMedications: () => Promise.resolve(MEDS),
  listDoseLogs: () => Promise.resolve(LOGS),
};
const base = { data, tz: "Europe/Kyiv", now: NOW };

Deno.test("без інструментів: повертає текст моделі, системна інструкція містить час користувача", async () => {
  const llm = scriptedLlm([[modelText("Привіт!")]]);
  const r = await runAgent({ ...base, llm, history: [], userMessage: "Привіт" });
  assertEquals(r.text, "Привіт!");
  assertEquals(r.toolCalls, []);
  assertEquals(r.llmCalls, 1);
  const sys = llm.requests[0].systemInstruction;
  assert(sys.includes("2026-11-02 15:21"), "є дата й час");
  assert(sys.includes("понеділок") && sys.includes("Europe/Kyiv"), "є день тижня й зона");
  assertEquals(llm.requests[0].tools.map((t) => t.name),
    ["get_medications", "get_schedule", "get_dose_logs", "get_statistics"]);
});

Deno.test("історія розмови передається як user_input / model_output, потім нове повідомлення", async () => {
  const llm = scriptedLlm([[modelText("ок")]]);
  await runAgent({
    ...base, llm, userMessage: "А ввечері?",
    history: [
      { role: "user", content: "Що приймати сьогодні?" },
      { role: "assistant", content: "Метформін о 08:00." },
    ],
  });
  const input = llm.requests[0].input;
  assertEquals(input.map((s) => s.type), ["user_input", "model_output", "user_input"]);
  assertEquals(input[2].content, [{ type: "text", text: "А ввечері?" }]);
  assertEquals(input[1].content, [{ type: "text", text: "Метформін о 08:00." }]);
});

Deno.test("цикл інструмента: function_call -> виконання -> function_result -> фінальна відповідь", async () => {
  const thought = { type: "thought", signature: "abc123" };
  const call = functionCall("call_1", "get_schedule", { part_of_day: "evening" });
  const llm = scriptedLlm([[thought, call], [modelText("Увечері: Омепразол о 21:00.")]]);
  const r = await runAgent({ ...base, llm, history: [], userMessage: "Що приймати ввечері?" });

  assertEquals(r.text, "Увечері: Омепразол о 21:00.");
  assertEquals(r.toolCalls, [{ name: "get_schedule", args: { part_of_day: "evening" } }]);
  assertEquals(r.llmCalls, 2);

  const second = llm.requests[1].input;
  assertEquals(second.map((s) => s.type), ["user_input", "thought", "function_call", "function_result"]);
  assertEquals(second[1], thought); // thought повертається без змін
  assertEquals(second[2], call);
  assertEquals(second[3].call_id, "call_1");
  assertEquals(second[3].name, "get_schedule");
  const payload = JSON.parse((second[3].result as Array<{ text: string }>)[0].text);
  assertEquals(payload.ok, true);
  assertEquals(payload.result.doses.map((d: { medication: string }) => d.medication), ["Омепразол"]);
});

Deno.test("кілька викликів в одному кроці: усі отримують результат зі своїм call_id", async () => {
  const llm = scriptedLlm([
    [functionCall("c1", "get_medications", {}), functionCall("c2", "get_statistics", { period: "today" })],
    [modelText("Готово")],
  ]);
  const r = await runAgent({ ...base, llm, history: [], userMessage: "Огляд" });
  assertEquals(r.toolCalls.map((t) => t.name), ["get_medications", "get_statistics"]);
  const results = llm.requests[1].input.filter((s) => s.type === "function_result");
  assertEquals(results.map((s) => s.call_id), ["c1", "c2"]);
});

Deno.test("аргументи інструмента як JSON-рядок розбираються", async () => {
  const llm = scriptedLlm([[functionCall("c1", "get_schedule", '{"date":"2026-11-03"}')], [modelText("ок")]]);
  const r = await runAgent({ ...base, llm, history: [], userMessage: "Завтра?" });
  assertEquals(r.toolCalls[0].args, { date: "2026-11-03" });
});

Deno.test("невідомий інструмент і хибні аргументи -> ok:false для моделі, цикл не падає", async () => {
  const llm = scriptedLlm([
    [functionCall("c1", "delete_everything", {}), functionCall("c2", "get_schedule", { date: "не дата" })],
    [modelText("Вибачте, не вийшло")],
  ]);
  const r = await runAgent({ ...base, llm, history: [], userMessage: "x" });
  assertEquals(r.text, "Вибачте, не вийшло");
  const results = llm.requests[1].input.filter((s) => s.type === "function_result")
    .map((s) => JSON.parse((s.result as Array<{ text: string }>)[0].text));
  assertEquals(results.map((x) => x.ok), [false, false]);
});

Deno.test("ліміт викликів моделі: нескінченні function_call -> запасна відповідь", async () => {
  const llm = scriptedLlm([[functionCall("c", "get_medications", {})]]); // повторюється завжди
  const r = await runAgent({ ...base, llm, history: [], userMessage: "x" });
  assertEquals(r.text, FALLBACK_TOO_MANY);
  assertEquals(llm.requests.length, MAX_LLM_CALLS);
});

Deno.test("ліміт інструментів: понад MAX_TOOL_CALLS отримують помилку, а не виконуються", async () => {
  const many = Array.from({ length: MAX_TOOL_CALLS + 3 }, (_, i) => functionCall(`c${i}`, "get_medications", {}));
  const llm = scriptedLlm([many, [modelText("ок")]]);
  const r = await runAgent({ ...base, llm, history: [], userMessage: "x" });
  assertEquals(r.toolCalls.length, MAX_TOOL_CALLS);
  const results = llm.requests[1].input.filter((s) => s.type === "function_result");
  assertEquals(results.length, MAX_TOOL_CALLS + 3); // кожен виклик має відповідь
  const last = JSON.parse((results[results.length - 1].result as Array<{ text: string }>)[0].text);
  assertEquals(last.ok, false);
});

Deno.test("надто великий результат інструмента замінюється на підказку звузити запит", async () => {
  const big: DataSource = {
    listMedications: () => Promise.resolve([{ ...MEDS[0], notes: "я".repeat(200) }]),
    listDoseLogs: () => Promise.resolve([]),
  };
  // 200 символів * 200 препаратів > 30 000 символів
  const manyMeds = Array.from({ length: 200 }, (_, i) => ({ ...MEDS[0], id: `m${i}`, name: `Препарат ${i}`, notes: "я".repeat(200) }));
  const llm = scriptedLlm([[functionCall("c1", "get_medications", {})], [modelText("ок")]]);
  await runAgent({ ...base, data: { ...big, listMedications: () => Promise.resolve(manyMeds) }, llm, history: [], userMessage: "x" });
  const res = JSON.parse((llm.requests[1].input[2].result as Array<{ text: string }>)[0].text);
  assertEquals(res.ok, false);
  assert(String(res.error).includes("too large"));
});

Deno.test("порожня відповідь моделі -> запасний текст; довга відповідь обрізається", async () => {
  const empty = await runAgent({ ...base, llm: scriptedLlm([[{ type: "thought" }]]), history: [], userMessage: "x" });
  assertEquals(empty.text, FALLBACK_NO_ANSWER);
  const long = await runAgent({ ...base, llm: scriptedLlm([[modelText("я".repeat(20000))]]), history: [], userMessage: "x" });
  assertEquals(long.text.length, MAX_REPLY_CHARS);
});

Deno.test("кілька model_output склеюються; content як рядок теж підтримується", async () => {
  const r = await runAgent({
    ...base, history: [], userMessage: "x",
    llm: scriptedLlm([[modelText("Part 1. "), { type: "model_output", content: "Part 2." }]]),
  });
  assertEquals(r.text, "Part 1. Part 2.");
});

Deno.test("помилка моделі піднімається нагору (обробник перетворить її на HTTP-статус)", async () => {
  const llm = scriptedLlm([new LlmError("rate_limited", "Gemini HTTP 429", 429)]);
  let kind = "";
  try {
    await runAgent({ ...base, llm, history: [], userMessage: "x" });
  } catch (e) {
    kind = (e as LlmError).kind;
  }
  assertEquals(kind, "rate_limited");
});