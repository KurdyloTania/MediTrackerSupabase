// Уся логіка запиту. Залежності (БД, авторизація) передаються ззовні,
// тому handler тестується без справжнього Supabase.

import { corsHeaders, errorResponse, jsonResponse } from "./_shared/http.ts";
import { MAX_BODY_BYTES, parseChatRequest } from "./_shared/validate.ts";

export type Role = "user" | "assistant";

export interface SavedMessage {
  id: string;
  role: Role;
  content: string;
  created_at: string;
}

export interface Deps {
  /** Повертає користувача за перевіреним JWT або null. */
  authenticate(): Promise<{ id: string } | null>;
  /** Перевіряє, що розмова належить користувачу (через RLS). */
  conversationExists(conversationId: string): Promise<boolean>;
  createConversation(userId: string, title: string): Promise<string>;
  saveMessage(
    userId: string,
    conversationId: string,
    role: Role,
    content: string,
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
      const parsed = parseChatRequest(json);
      if (!parsed.ok) {
        return errorResponse(400, "invalid_request", parsed.message);
      }
      const { message, conversationId, timezone } = parsed.value;

      // 3. Розмова: існуюча (власна) або нова
      let convId: string;
      if (conversationId) {
        // Не розкриваємо, чи існує чужа розмова: для обох випадків 404.
        if (!(await deps.conversationExists(conversationId))) {
          return errorResponse(404, "not_found", "Розмову не знайдено.");
        }
        convId = conversationId;
      } else {
        convId = await deps.createConversation(user.id, message.slice(0, 60));
      }

      // 4. Зберігаємо повідомлення користувача
      await deps.saveMessage(user.id, convId, "user", message);

      // 5. ЕТАП 2: відповідь-заглушка. На етапі 4 тут буде виклик Gemini.
      const reply =
        `Каркас асистента працює. Я отримав ваше повідомлення (${message.length} симв.). ` +
        `Часова зона: ${timezone}. Відповіді на основі ваших даних з'являться на наступних етапах.`;
      const saved = await deps.saveMessage(user.id, convId, "assistant", reply);

      return jsonResponse({ conversation_id: convId, message: saved });
    } catch (err) {
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