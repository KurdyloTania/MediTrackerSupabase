import { assert, assertEquals } from "../testing.ts";
import { createGeminiClient, parseRetryAfterSeconds } from "./gemini.ts";
import { LlmError } from "./types.ts";

const REQ = {
  systemInstruction: "SYS",
  input: [{ type: "user_input", content: [{ type: "text", text: "привіт" }] }],
  tools: [{ name: "get_schedule", description: "d", parameters: { type: "object", properties: {} } }],
};
const KEY = "TEST-KEY-123";

function fetchStub(status: number, body: unknown, capture?: { url?: string; init?: RequestInit }) {
  return ((url: string | URL | Request, init?: RequestInit) => {
    if (capture) { capture.url = String(url); capture.init = init; }
    return Promise.resolve(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));
  }) as typeof fetch;
}
async function kindOf(p: Promise<unknown>): Promise<LlmError> {
  try { await p; } catch (e) { return e as LlmError; }
  throw new Error("очікувалась помилка");
}

Deno.test("запит: URL, заголовки, store:false, tools, system_instruction; ключ не в URL", async () => {
  const cap: { url?: string; init?: RequestInit } = {};
  const llm = createGeminiClient({ apiKey: KEY, model: "gemini-3.8-flash", fetchImpl: fetchStub(200, { steps: [] }, cap) });
  await llm.generate(REQ);
  assertEquals(cap.url, "https://generativelanguage.googleapis.com/v1beta/interactions");
  assert(!String(cap.url).includes(KEY), "ключ не в URL");
  const headers = cap.init!.headers as Record<string, string>;
  assertEquals(headers["x-goog-api-key"], KEY);
  const body = JSON.parse(String(cap.init!.body));
  assertEquals(body.model, "gemini-3.8-flash");
  assertEquals(body.store, false);
  assertEquals(body.system_instruction, "SYS");
  assertEquals(body.input, REQ.input);
  assertEquals(body.tools, [{ type: "function", name: "get_schedule", description: "d", parameters: { type: "object", properties: {} } }]);
  assertEquals(body.generation_config.max_output_tokens, 4096);
});

Deno.test("відповідь: повертає steps, відкидає некоректні елементи", async () => {
  const steps = [{ type: "thought" }, { type: "model_output", content: [{ type: "text", text: "Привіт" }] }, 42, null, { noType: 1 }];
  const llm = createGeminiClient({ apiKey: KEY, model: "m", fetchImpl: fetchStub(200, { id: "x", steps }) });
  const r = await llm.generate(REQ);
  assertEquals(r.steps.map((s) => s.type), ["thought", "model_output"]);
});

Deno.test("HTTP-статуси відображаються на типи помилок", async () => {
  const cases: Array<[number, unknown, string]> = [
    [429, { error: { status: "RESOURCE_EXHAUSTED" } }, "rate_limited"],
    [401, {}, "auth"], [403, {}, "auth"],
    [400, { error: { status: "INVALID_ARGUMENT" } }, "bad_request"],
    [404, {}, "bad_request"],
    [500, {}, "unavailable"], [503, { error: { status: "UNAVAILABLE" } }, "unavailable"],
  ];
  for (const [status, body, kind] of cases) {
    const llm = createGeminiClient({ apiKey: KEY, model: "m", fetchImpl: fetchStub(status, body) });
    const e = await kindOf(llm.generate(REQ));
    assertEquals(e.kind, kind, `HTTP ${status}`);
    assertEquals(e.status, status);
  }
});

Deno.test("помилки не містять ні ключа, ні тексту запиту", async () => {
  const llm = createGeminiClient({
    apiKey: KEY, model: "m",
    fetchImpl: fetchStub(400, { error: { status: "INVALID_ARGUMENT", message: `bad key ${KEY} for привіт` } }),
  });
  const e = await kindOf(llm.generate(REQ));
  assert(!e.message.includes(KEY) && !e.message.includes("привіт"), "витік у повідомленні помилки");
  assertEquals(e.message, "Gemini HTTP 400 INVALID_ARGUMENT");
});

Deno.test("detail: текст помилки Google окремо від message, ключ вирізається", async () => {
  const llm = createGeminiClient({
    apiKey: KEY, model: "m",
    fetchImpl: fetchStub(400, { error: { status: "INVALID_ARGUMENT", message: `Unknown name "x" ... key=${KEY}` } }),
  });
  const e = await kindOf(llm.generate(REQ));
  assert(!e.message.includes("Unknown"), "message лишається службовим");
  assert(!!e.detail && e.detail.includes("Unknown name"), "detail містить пояснення Google");
  assert(!e.detail.includes(KEY) && e.detail.includes("[KEY]"), "ключ вирізано");
});

Deno.test("мережева помилка і таймаут -> unavailable", async () => {
  const netFail = createGeminiClient({ apiKey: KEY, model: "m", fetchImpl: (() => Promise.reject(new TypeError("fetch failed"))) as typeof fetch });
  assertEquals((await kindOf(netFail.generate(REQ))).kind, "unavailable");

  const hanging = ((_u: unknown, init?: RequestInit) => new Promise((_res, rej) => {
    init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
  })) as typeof fetch;
  const slow = createGeminiClient({ apiKey: KEY, model: "m", timeoutMs: 30, fetchImpl: hanging });
  const e = await kindOf(slow.generate(REQ));
  assertEquals(e.kind, "unavailable");
  assert(e.message.includes("timed out"));
});

Deno.test("відповідь без steps / не JSON -> bad_response", async () => {
  const a = createGeminiClient({ apiKey: KEY, model: "m", fetchImpl: fetchStub(200, { id: "x" }) });
  assertEquals((await kindOf(a.generate(REQ))).kind, "bad_response");
  const b = createGeminiClient({ apiKey: KEY, model: "m", fetchImpl: fetchStub(200, "<html>") });
  assertEquals((await kindOf(b.generate(REQ))).kind, "bad_response");
});

Deno.test("немає ключа -> not_configured, мережу не викликає", async () => {
  let called = false;
  const llm = createGeminiClient({ apiKey: "", model: "m", fetchImpl: (() => { called = true; return Promise.resolve(new Response("{}")); }) as typeof fetch });
  assertEquals((await kindOf(llm.generate(REQ))).kind, "not_configured");
  assertEquals(called, false);
});

Deno.test("429: час повтору з RetryInfo.retryDelay і з тексту 'retry in Ns'", async () => {
  const a = createGeminiClient({
    apiKey: KEY, model: "m",
    fetchImpl: fetchStub(429, { error: { status: "RESOURCE_EXHAUSTED", message: "x", details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "52.4s" }] } }),
  });
  assertEquals((await kindOf(a.generate(REQ))).retryAfterSeconds, 53);
  const b = createGeminiClient({
    apiKey: KEY, model: "m",
    fetchImpl: fetchStub(429, { error: { status: "RESOURCE_EXHAUSTED", message: "limit: 5 requests per minute. Please retry in 53s or upgrade" } }),
  });
  assertEquals((await kindOf(b.generate(REQ))).retryAfterSeconds, 53);
  const c = createGeminiClient({ apiKey: KEY, model: "m", fetchImpl: fetchStub(429, { error: { status: "RESOURCE_EXHAUSTED" } }) });
  assertEquals((await kindOf(c.generate(REQ))).retryAfterSeconds, undefined);
});

Deno.test("parseRetryAfterSeconds: некоректні значення ігноруються", () => {
  assertEquals(parseRetryAfterSeconds(undefined), undefined);
  assertEquals(parseRetryAfterSeconds({ details: [{ retryDelay: "soon" }] }), undefined);
  assertEquals(parseRetryAfterSeconds({ message: "no hint" }), undefined);
});

Deno.test("thinking_level додається лише коли задано", async () => {
  const cap1: { url?: string; init?: RequestInit } = {};
  await createGeminiClient({ apiKey: KEY, model: "m", fetchImpl: fetchStub(200, { steps: [] }, cap1) }).generate(REQ);
  assertEquals(JSON.parse(String(cap1.init!.body)).generation_config.thinking_level, undefined);
  const cap2: { url?: string; init?: RequestInit } = {};
  await createGeminiClient({ apiKey: KEY, model: "m", thinkingLevel: "low", fetchImpl: fetchStub(200, { steps: [] }, cap2) }).generate(REQ);
  assertEquals(JSON.parse(String(cap2.init!.body)).generation_config.thinking_level, "low");
});