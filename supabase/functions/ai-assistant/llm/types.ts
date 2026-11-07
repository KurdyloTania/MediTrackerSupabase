// Загальні типи для роботи з мовною моделлю. Решта коду залежить лише від цих
// інтерфейсів, а не від конкретного провайдера: модель можна підмінити (і в тестах).

/** Крок розмови в форматі Interactions API (user_input, model_output, function_call, ...). */
export type Step = { type: string; [key: string]: unknown };

export interface ToolDeclaration {
  name: string;
  description: string;
  parameters: unknown;
}

export interface GenerateRequest {
  systemInstruction: string;
  input: Step[];
  tools: readonly ToolDeclaration[];
}

export interface GenerateResponse {
  /** Кроки, згенеровані моделлю (thought, function_call, model_output). */
  steps: Step[];
}

export interface LlmClient {
  generate(req: GenerateRequest): Promise<GenerateResponse>;
}

export type LlmErrorKind =
  | "rate_limited" // 429: перевищено ліміти безкоштовного рівня
  | "unavailable" // 5xx, таймаут, мережа
  | "auth" // ключ недійсний / немає доступу
  | "bad_request" // 400/404: хибний запит чи модель
  | "bad_response" // відповідь у несподіваному форматі
  | "not_configured"; // немає GEMINI_API_KEY

export class LlmError extends Error {
  readonly kind: LlmErrorKind;
  readonly status?: number;
  /** Пояснення від Google (лише для налагодження; НЕ логується й не йде користувачу). */
  readonly detail?: string;
  /** Через скільки секунд можна повторити запит (з відповіді Google при 429). */
  readonly retryAfterSeconds?: number;
  constructor(
    kind: LlmErrorKind,
    message: string,
    status?: number,
    detail?: string,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "LlmError";
    this.kind = kind;
    this.status = status;
    this.detail = detail;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}