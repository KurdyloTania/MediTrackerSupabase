// Валідація вхідного запиту. Чиста функція без залежностей - легко тестується.

export const MAX_MESSAGE_LENGTH = 2000;
export const MAX_BODY_BYTES = 16 * 1024;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ChatRequest {
  message: string;
  conversationId: string | null;
  timezone: string;
}

export type ParseResult =
  | { ok: true; value: ChatRequest }
  | { ok: false; message: string };

export function isValidTimezone(tz: unknown): tz is string {
  if (typeof tz !== "string" || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function parseChatRequest(raw: unknown): ParseResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, message: "Тіло запиту має бути JSON-об'єктом." };
  }
  const body = raw as Record<string, unknown>;

  if (typeof body.message !== "string") {
    return { ok: false, message: "Поле message обов'язкове (рядок)." };
  }
  const message = body.message.trim();
  if (message.length === 0) {
    return { ok: false, message: "Повідомлення не може бути порожнім." };
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      message: `Повідомлення задовге (максимум ${MAX_MESSAGE_LENGTH} символів).`,
    };
  }

  let conversationId: string | null = null;
  if (body.conversation_id !== undefined && body.conversation_id !== null) {
    if (
      typeof body.conversation_id !== "string" ||
      !UUID_RE.test(body.conversation_id)
    ) {
      return { ok: false, message: "conversation_id має бути UUID." };
    }
    conversationId = body.conversation_id.toLowerCase();
  }

  if (!isValidTimezone(body.timezone)) {
    return {
      ok: false,
      message: "Поле timezone має бути коректною IANA-зоною, напр. Europe/Kyiv.",
    };
  }

  return { ok: true, value: { message, conversationId, timezone: body.timezone } };
}