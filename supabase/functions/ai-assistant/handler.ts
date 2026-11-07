// Уся логіка запиту. Залежності (БД, авторизація) передаються ззовні,
// тому handler тестується без справжнього Supabase.

import { corsHeaders, errorResponse, jsonResponse } from "./_shared/http.ts";
import { isValidTimezone, MAX_BODY_BYTES, parseChatRequest } from "./_shared/validate.ts";
import { type DataSource, executeTool } from "./tools/executor.ts";
import { type HistoryMessage, runAgent, type ToolCallRecord } from "./llm/agent.ts";
import { type LlmClient, LlmError } from "./llm/types.ts";

/** Скільки останніх повідомлень розмови передаємо моделі як контекст. */
export const HISTORY_LIMIT = 12;

export type Role = "user" | "assistant";

export interface SavedMessage {
  id: string;
  role: Role;
  content: string;
  created_at: string;
}

export interface Deps {
  /** Читання медичних даних користувача (через RLS). Використовують інструменти. */
  data: DataSource;
  /** Мовна модель (Gemini). У тестах підміняється заглушкою. */
  llm: LlmClient;
  now(): Date;
  /** Налагоджувальний режим для перевірки інструментів без Gemini (етап 3). */
  debugTools: boolean;
  /** Повертає користувача за перевіреним JWT або null. */
  authenticate(): Promise<{ id: string } | null>;
  /** Перевіряє, що розмова належить користувачу (через RLS). */
  conversationExists(conversationId: string): Promise<boolean>;
  /** Останні повідомлення розмови (від старих до нових), через RLS. */
  recentMessages(conversationId: string, limit: number): Promise<HistoryMessage[]>;
  createConversation(userId: string, title: string): Promise<string>;
  saveMessage(
    userId: string,
    conversationId: string,
    role: Role,
    content: string,
    toolCalls?: ToolCallRecord[],
  ): Promise<SavedMessage>;
}

export type DepsFactory = (accessToken: string) => Deps;

export function makeHandler(createDeps: DepsFactory) {
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (req.method !== "POST") {
      return errorResponse(405, "method_not_allowed", "Дозволено лише POST.");
    }

    // 1. Авторизація
    const authHeader = req.headers.get("Authorization") ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(authHeader);
    if (!match) {
      return errorResponse(401, "unauthorized", "Потрібна авторизація.");
    }
    const deps = createDeps(match[1]);

    try {
      const user = await deps.authenticate();
      if (!user) {
        return errorResponse(401, "unauthorized", "Сесія недійсна.");
      }

      // 2. Валідація тіла
      const text = await req.text();
      if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
        return errorResponse(413, "payload_too_large", "Запит завеликий.");
      }
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        return errorResponse(400, "invalid_json", "Некоректний JSON.");
      }

      // ЕТАП 3 (тимчасово): прямий виклик інструмента для перевірки на реальних даних.
      // Вмикається лише секретом AI_DEBUG_TOOLS=1; на етапі 6 видалимо.
      if (
        deps.debugTools && typeof json === "object" && json !== null &&
        typeof (json as Record<string, unknown>).debug_tool === "string"
      ) {
        const j = json as Record<string, unknown>;
        if (!isValidTimezone(j.timezone)) {
          return errorResponse(400, "invalid_request", "Потрібна коректна timezone.");
        }
        const r = await executeTool(j.debug_tool as string, j.debug_args, {
          tz: j.timezone, now: new Date(), data: deps.data,
        });
        return jsonResponse(r);
      }

      const parsed = parseChatRequest(json);
      if (!parsed.ok) {
        return errorResponse(400, "invalid_request", parsed.message);
      }
      const { message, conversationId, timezone } = parsed.value;

      // 3. Розмова: існуюча (власна) - перевіряємо й беремо історію; нова - створимо після відповіді
      let convId: string | null = null;
      let history: HistoryMessage[] = [];
      if (conversationId) {
        // Не розкриваємо, чи існує чужа розмова: для обох випадків 404.
        if (!(await deps.conversationExists(conversationId))) {
          return errorResponse(404, "not_found", "Розмову не знайдено.");
        }
        convId = conversationId;
        history = await deps.recentMessages(convId, HISTORY_LIMIT);
      }

      // 4. Агент: модель + інструменти. Якщо модель недоступна - нічого не зберігаємо.
      const answer = await runAgent({
        llm: deps.llm,
        data: deps.data,
        history,
        userMessage: message,
        tz: timezone,
        now: deps.now(),
      });

      // 5. Зберігаємо пару повідомлень (питання + відповідь) лише після успіху
      if (!convId) convId = await deps.createConversation(user.id, message.slice(0, 60));
      await deps.saveMessage(user.id, convId, "user", message);
      const saved = await deps.saveMessage(
        user.id, convId, "assistant", answer.text,
        answer.toolCalls.length ? answer.toolCalls : undefined,
      );

      return jsonResponse({ conversation_id: convId, message: saved });
    } catch (err) {
      if (err instanceof LlmError) return llmErrorResponse(err, deps.debugTools);
      // НЕ логуємо текст повідомлень - це потенційно медичні дані.
      console.error(
        "ai-assistant error:",
        err instanceof Error ? err.name : "unknown",
      );
      return errorResponse(
        500,
        "internal_error",
        "Сталася внутрішня помилка. Спробуйте пізніше.",
      );
    }
  };
}

/**
 * Зрозумілі користувачу помилки моделі. У логи - лише тип і HTTP-статус, без вмісту.
 * Деталь від Google додається у відповідь ТІЛЬКИ в налагоджувальному режимі (секрет AI_DEBUG_TOOLS).
 */
function llmErrorResponse(err: LlmError, debug: boolean): Response {
  console.error("ai-assistant llm error:", err.kind, err.status ?? "", err.message);
  const extra = debug ? { debug: { kind: err.kind, status: err.status ?? null, detail: err.detail ?? null } } : {};
  const make = (status: number, code: string, message: string, retryAfter?: number) =>
    jsonResponse(
      {
        error: { code, message, ...(retryAfter ? { retry_after_seconds: retryAfter } : {}) },
        ...extra,
      },
      status,
      retryAfter ? { "Retry-After": String(retryAfter) } : {},
    );
  switch (err.kind) {
    case "rate_limited": {
      // Підказка клієнту, скільки чекати (з відповіді Google; за замовчуванням хвилина).
      const wait = Math.min(Math.max(err.retryAfterSeconds ?? 60, 1), 300);
      return make(429, "ai_rate_limited", `Асистент зараз перевантажений. Спробуйте за ${wait} с.`, wait);
    }
    case "unavailable":
      return make(503, "ai_unavailable", "Асистент тимчасово недоступний. Спробуйте пізніше.");
    case "not_configured":
      return make(503, "ai_not_configured", "Асистент ще не налаштований.");
    default:
      return make(502, "ai_error", "Не вдалося отримати відповідь асистента.");
  }
}