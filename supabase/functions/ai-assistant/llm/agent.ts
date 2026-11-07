// Цикл агента: модель просить дані -> наш код виконує інструменти -> результат
// повертається моделі -> так до готової текстової відповіді.
//
// Безпека циклу:
//   * інструменти лише читають дані (див. tools/executor.ts);
//   * жорсткі ліміти: кількість викликів моделі, кількість викликів інструментів, розмір результату;
//   * кроки моделі (thought, function_call) повертаються їй БЕЗ змін - так вимагає API.

import { executeTool, type DataSource } from "../tools/executor.ts";
import { toolDefinitions } from "../tools/definitions.ts";
import { buildSystemInstruction } from "./prompt.ts";
import type { LlmClient, Step, ToolDeclaration } from "./types.ts";

export const MAX_LLM_CALLS = 5; // 1 основний + до 4 раундів інструментів
export const MAX_TOOL_CALLS = 8; // усього інструментів за одне запитання
export const MAX_RESULT_CHARS = 30_000; // ~10 тис. токенів на один результат
export const MAX_REPLY_CHARS = 7_900; // ліміт колонки content у БД - 8000

export const FALLBACK_NO_ANSWER =
  "Не вдалося сформувати відповідь. Спробуйте переформулювати запитання.";
export const FALLBACK_TOO_MANY =
  "Мені не вдалося отримати всі потрібні дані за один раз. Спробуйте поставити простіше запитання.";

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentInput {
  llm: LlmClient;
  data: DataSource;
  /** Попередні повідомлення розмови (лише текст), від старих до нових. */
  history: HistoryMessage[];
  userMessage: string;
  tz: string;
  now: Date;
  tools?: readonly ToolDeclaration[];
}

export interface ToolCallRecord {
  name: string;
  args: unknown;
}

export interface AgentResult {
  text: string;
  toolCalls: ToolCallRecord[];
  llmCalls: number;
}

const textPart = (text: string) => [{ type: "text", text }];

export function historyToSteps(history: HistoryMessage[]): Step[] {
  return history.map((m) =>
    m.role === "user"
      ? { type: "user_input", content: textPart(m.content) }
      : { type: "model_output", content: textPart(m.content) }
  );
}

function stepText(step: Step): string {
  const c = step.content;
  if (typeof c === "string") return c;
  if (!Array.isArray(c)) return "";
  return c
    .map((p) => {
      const part = p as { type?: unknown; text?: unknown };
      return part && part.type === "text" && typeof part.text === "string" ? part.text : "";
    })
    .join("");
}

function parseArgs(raw: unknown): unknown {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw ?? {};
}

export async function runAgent(input: AgentInput): Promise<AgentResult> {
  const system = buildSystemInstruction(input.now, input.tz);
  const tools = input.tools ?? (toolDefinitions as unknown as readonly ToolDeclaration[]);
  const toolCtx = { tz: input.tz, now: input.now, data: input.data };

  const conversation: Step[] = [
    ...historyToSteps(input.history),
    { type: "user_input", content: textPart(input.userMessage) },
  ];
  const toolCalls: ToolCallRecord[] = [];

  for (let call = 1; call <= MAX_LLM_CALLS; call++) {
    const { steps } = await input.llm.generate({ systemInstruction: system, input: conversation, tools });

    const functionCalls = steps.filter((s) => s.type === "function_call");
    if (functionCalls.length === 0) {
      const text = steps.filter((s) => s.type === "model_output").map(stepText).join("").trim();
      return {
        text: text ? text.slice(0, MAX_REPLY_CHARS) : FALLBACK_NO_ANSWER,
        toolCalls,
        llmCalls: call,
      };
    }

    // Усі кроки моделі (разом з thought) повертаємо як є, далі - результати інструментів.
    conversation.push(...steps);
    for (const fc of functionCalls) {
      const name = String(fc.name ?? "");
      const args = parseArgs(fc.arguments);
      let result: unknown;
      if (toolCalls.length >= MAX_TOOL_CALLS) {
        result = { ok: false, error: "Too many tool calls in one turn. Answer with the data you already have." };
      } else {
        toolCalls.push({ name, args });
        result = await executeTool(name, args, toolCtx);
      }
      let json = JSON.stringify(result);
      if (json.length > MAX_RESULT_CHARS) {
        json = JSON.stringify({ ok: false, error: "Result is too large. Narrow the request (shorter period or one medication)." });
      }
      conversation.push({
        type: "function_result",
        name,
        call_id: fc.id,
        result: textPart(json),
      });
    }
  }
  return { text: FALLBACK_TOO_MANY, toolCalls, llmCalls: MAX_LLM_CALLS };
}