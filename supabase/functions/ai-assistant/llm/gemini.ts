// Клієнт Gemini через Interactions API (рекомендований Google шлях).
//   * store: false  - Google не зберігає розмову між запитами; історію веде наш сервер;
//   * ключ передається заголовком x-goog-api-key (не в URL) і ніколи не потрапляє в логи;
//   * у повідомленнях про помилки немає ні тексту запитів, ні відповідей.

import {
  type GenerateRequest, type GenerateResponse, type LlmClient, LlmError, type Step,
} from "./types.ts";

export interface GeminiConfig {
  apiKey: string;
  model: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  /** Необов'язково: глибина "роздумів" моделі (менше = швидше). Не задано - значення за замовчуванням. */
  thinkingLevel?: "minimal" | "low" | "medium" | "high";
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Затримка до повтору: стандартне поле RetryInfo ("53s") або текст "retry in 53s". */
export function parseRetryAfterSeconds(error: unknown): number | undefined {
  const e = error as { details?: unknown; message?: unknown } | undefined;
  if (Array.isArray(e?.details)) {
    for (const d of e.details) {
      const delay = (d as { retryDelay?: unknown })?.retryDelay;
      if (typeof delay === "string") {
        const m = /^(\d+(?:\.\d+)?)s$/.exec(delay);
        if (m) return Math.ceil(Number(m[1]));
      }
    }
  }
  if (typeof e?.message === "string") {
    const m = /retry in (\d+(?:\.\d+)?)s/i.exec(e.message);
    if (m) return Math.ceil(Number(m[1]));
  }
  return undefined;
}

export function createGeminiClient(cfg: GeminiConfig): LlmClient {
  const doFetch = cfg.fetchImpl ?? fetch;
  const timeoutMs = cfg.timeoutMs ?? 30_000;

  return {
    async generate(req: GenerateRequest): Promise<GenerateResponse> {
      if (!cfg.apiKey) throw new LlmError("not_configured", "GEMINI_API_KEY is not set");

      const body = {
        model: cfg.model,
        store: false,
        system_instruction: req.systemInstruction,
        input: req.input,
        tools: req.tools.map((t) => ({
          type: "function",
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
        generation_config: {
          max_output_tokens: cfg.maxOutputTokens ?? 4096,
          ...(cfg.thinkingLevel ? { thinking_level: cfg.thinkingLevel } : {}),
        },
      };

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await doFetch(`${cfg.baseUrl ?? DEFAULT_BASE}/interactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (e) {
        const timedOut = e instanceof DOMException && e.name === "AbortError";
        throw new LlmError("unavailable", timedOut ? "Gemini request timed out" : "Gemini network error");
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        // У message / логи - лише службовий статус (напр. RESOURCE_EXHAUSTED).
        // Текст помилки Google йде окремо в detail: його бачить лише налагоджувальний режим.
        let googleStatus = "";
        let googleMessage = "";
        let retryAfter: number | undefined;
        try {
          const j = await res.json();
          if (typeof j?.error?.status === "string") googleStatus = j.error.status;
          if (typeof j?.error?.message === "string") googleMessage = j.error.message;
          retryAfter = parseRetryAfterSeconds(j?.error);
        } catch { /* тіло не JSON */ }
        const message = `Gemini HTTP ${res.status}${googleStatus ? ` ${googleStatus}` : ""}`;
        const detail = googleMessage.split(cfg.apiKey).join("[KEY]").slice(0, 300) || undefined;
        if (res.status === 429) throw new LlmError("rate_limited", message, 429, detail, retryAfter);
        if (res.status === 401 || res.status === 403) throw new LlmError("auth", message, res.status, detail);
        if (res.status >= 500) throw new LlmError("unavailable", message, res.status, detail);
        throw new LlmError("bad_request", message, res.status, detail);
      }

      let json: unknown;
      try {
        json = await res.json();
      } catch {
        throw new LlmError("bad_response", "Gemini returned non-JSON body");
      }
      const steps = (json as { steps?: unknown })?.steps;
      if (!Array.isArray(steps)) throw new LlmError("bad_response", "Gemini response has no steps");
      const valid = steps.filter(
        (s): s is Step => typeof s === "object" && s !== null && typeof (s as Step).type === "string",
      );
      return { steps: valid };
    },
  };
}