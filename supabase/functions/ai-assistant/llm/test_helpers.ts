// Допоміжні заглушки для тестів моделі (у продакшн-код не потрапляють).
import type { GenerateRequest, GenerateResponse, LlmClient, Step } from "./types.ts";

export const modelText = (text: string): Step => ({
  type: "model_output",
  content: [{ type: "text", text }],
});

export const functionCall = (id: string, name: string, args: unknown): Step => ({
  type: "function_call",
  id,
  name,
  arguments: args,
});

/** Модель, що по черзі віддає заздалегідь підготовлені відповіді й запам'ятовує запити. */
export function scriptedLlm(script: Array<Step[] | Error>): LlmClient & { requests: GenerateRequest[] } {
  const requests: GenerateRequest[] = [];
  let i = 0;
  return {
    requests,
    generate(req: GenerateRequest): Promise<GenerateResponse> {
      // глибока копія: агент далі змінює масив input
      requests.push(JSON.parse(JSON.stringify(req)));
      const next = script[Math.min(i++, script.length - 1)];
      if (next instanceof Error) return Promise.reject(next);
      return Promise.resolve({ steps: next });
    },
  };
}