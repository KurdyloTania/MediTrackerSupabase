// Запуск: deno test --config deno.json handler_test.ts
import { type Deps, HISTORY_LIMIT, makeHandler, type Role } from "./handler.ts";
import type { DataSource } from "./tools/executor.ts";
import type { HistoryMessage, ToolCallRecord } from "./llm/agent.ts";
import { LlmError, type Step } from "./llm/types.ts";
import { functionCall, modelText, scriptedLlm } from "./llm/test_helpers.ts";
import { assert, assertEquals } from "./testing.ts";

const USER = { id: "11111111-1111-1111-1111-111111111111" };
const OWN_CONV = "c1000000-0000-4000-8000-000000000001";
const FOREIGN_CONV = "c2000000-0000-4000-8000-000000000002";
const NEW_CONV = "c3000000-0000-4000-8000-000000000003";
const NOW = new Date("2026-11-02T13:21:00Z");

const emptyData: DataSource = {
  listMedications: () => Promise.resolve([]),
  listDoseLogs: () => Promise.resolve([]),
};

interface Opts {
  user?: { id: string } | null;
  failDb?: boolean;
  debug?: boolean;
  script?: Array<Step[] | Error>;
  history?: HistoryMessage[];
}

function fakeDeps(opts: Opts = {}) {
  const saved: { role: Role; content: string; conv: string; toolCalls?: ToolCallRecord[] }[] = [];
  const created: string[] = [];
  const historyCalls: Array<[string, number]> = [];
  const llm = scriptedLlm(opts.script ?? [[modelText("Відповідь тесту")]]);
  const deps: Deps = {
    data: emptyData,
    llm,
    now: () => NOW,
    debugTools: opts.debug ?? false,
    authenticate: () => Promise.resolve(opts.user === undefined ? USER : opts.user),
    conversationExists: (id) => {
      if (opts.failDb) return Promise.reject(new Error("db secret details"));
      return Promise.resolve(id === OWN_CONV);
    },
    recentMessages: (conv, limit) => {
      historyCalls.push([conv, limit]);
      return Promise.resolve(opts.history ?? []);
    },
    createConversation: (_u, title) => {
      if (opts.failDb) return Promise.reject(new Error("db secret details"));
      created.push(title);
      return Promise.resolve(NEW_CONV);
    },
    saveMessage: (_u, conv, role, content, toolCalls) => {
      saved.push({ role, content, conv, toolCalls });
      return Promise.resolve({ id: crypto.randomUUID(), role, content, created_at: new Date().toISOString() });
    },
  };
  return { deps, saved, created, llm, historyCalls };
}

function req(body: unknown, init: { method?: string; auth?: string | null } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.auth !== null) headers.Authorization = init.auth ?? "Bearer tok";
  return new Request("http://x/ai-assistant", {
    method: init.method ?? "POST",
    headers,
    body: init.method === "GET" || init.method === "OPTIONS" ? undefined :
      typeof body === "string" ? body : JSON.stringify(body),
  });
}

const ok = { message: "Які ліки я приймаю?", timezone: "Europe/Kyiv" };
const status = async (h: ReturnType<typeof makeHandler>, r: Request) => (await h(r)).status;

Deno.test("OPTIONS -> 204 з CORS", async () => {
  const r = await makeHandler(() => fakeDeps().deps)(req(null, { method: "OPTIONS", auth: null }));
  assertEquals(r.status, 204);
  assert(!!r.headers.get("Access-Control-Allow-Origin"), "no CORS");
});

Deno.test("GET -> 405; без Authorization -> 401; недійсний токен -> 401", async () => {
  assertEquals(await status(makeHandler(() => fakeDeps().deps), req(null, { method: "GET" })), 405);
  assertEquals(await status(makeHandler(() => fakeDeps().deps), req(ok, { auth: null })), 401);
  assertEquals(await status(makeHandler(() => fakeDeps({ user: null }).deps), req(ok)), 401);
});

Deno.test("недійсний токен: модель не викликається", async () => {
  const f = fakeDeps({ user: null });
  await makeHandler(() => f.deps)(req(ok));
  assertEquals(f.llm.requests.length, 0);
});

for (const [name, body] of Object.entries({
  "порожнє повідомлення": { ...ok, message: "   " },
  "повідомлення не рядок": { ...ok, message: 42 },
  "задовге повідомлення": { ...ok, message: "а".repeat(2001) },
  "хибна часова зона": { ...ok, timezone: "Mars/Olympus" },
  "немає часової зони": { message: "привіт" },
  "conversation_id не UUID": { ...ok, conversation_id: "123" },
  "масив замість об'єкта": [1, 2],
})) {
  Deno.test(`валідація: ${name} -> 400, нічого не зберігається, модель не викликається`, async () => {
    const f = fakeDeps();
    assertEquals(await status(makeHandler(() => f.deps), req(body)), 400);
    assertEquals(f.saved.length, 0);
    assertEquals(f.llm.requests.length, 0);
  });
}

Deno.test("битий JSON -> 400; завеликий body -> 413", async () => {
  assertEquals(await status(makeHandler(() => fakeDeps().deps), req("{не json")), 400);
  assertEquals(await status(makeHandler(() => fakeDeps().deps), req({ ...ok, pad: "x".repeat(20000) })), 413);
});

Deno.test("нова розмова: відповідь моделі, розмова створюється ПІСЛЯ відповіді, 2 повідомлення, заголовок <=60", async () => {
  const f = fakeDeps();
  const r = await makeHandler(() => f.deps)(req({ ...ok, message: "Я".repeat(100) }));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.conversation_id, NEW_CONV);
  assertEquals(j.message.role, "assistant");
  assertEquals(j.message.content, "Відповідь тесту");
  assertEquals(f.created.length, 1);
  assertEquals(f.created[0].length, 60);
  assertEquals(f.saved.map((s) => s.role), ["user", "assistant"]);
  assertEquals(f.historyCalls.length, 0); // у новій розмові історії немає
  assertEquals(f.llm.requests.length, 1);
});

Deno.test("існуюча власна розмова: історія береться з БД і передається моделі", async () => {
  const history: HistoryMessage[] = [
    { role: "user", content: "Привіт" },
    { role: "assistant", content: "Вітаю! Чим допомогти?" },
  ];
  const f = fakeDeps({ history });
  const r = await makeHandler(() => f.deps)(req({ ...ok, conversation_id: OWN_CONV }));
  assertEquals(r.status, 200);
  assertEquals((await r.json()).conversation_id, OWN_CONV);
  assertEquals(f.created.length, 0);
  assertEquals(f.historyCalls, [[OWN_CONV, HISTORY_LIMIT]]);
  assertEquals(f.llm.requests[0].input.map((s) => s.type), ["user_input", "model_output", "user_input"]);
});

Deno.test("чужа розмова -> 404, нічого не зберігається, модель не викликається", async () => {
  const f = fakeDeps();
  const r = await makeHandler(() => f.deps)(req({ ...ok, conversation_id: FOREIGN_CONV }));
  assertEquals(r.status, 404);
  assertEquals(f.saved.length, 0);
  assertEquals(f.llm.requests.length, 0);
});

Deno.test("виклики інструментів зберігаються разом із відповіддю асистента (назва + аргументи)", async () => {
  const f = fakeDeps({
    script: [[functionCall("c1", "get_schedule", { part_of_day: "evening" })], [modelText("Омепразол о 21:00")]],
  });
  const r = await makeHandler(() => f.deps)(req(ok));
  assertEquals(r.status, 200);
  const assistant = f.saved.find((s) => s.role === "assistant")!;
  assertEquals(assistant.toolCalls, [{ name: "get_schedule", args: { part_of_day: "evening" } }]);
  assertEquals(f.saved.find((s) => s.role === "user")!.toolCalls, undefined);
});

for (const [kind, expectedStatus, code] of [
  ["rate_limited", 429, "ai_rate_limited"],
  ["unavailable", 503, "ai_unavailable"],
  ["not_configured", 503, "ai_not_configured"],
  ["auth", 502, "ai_error"],
  ["bad_request", 502, "ai_error"],
  ["bad_response", 502, "ai_error"],
] as const) {
  Deno.test(`помилка моделі ${kind} -> HTTP ${expectedStatus} (${code}), нічого не зберігається`, async () => {
    const f = fakeDeps({ script: [new LlmError(kind, `Gemini ${kind}`, 429)] });
    const r = await makeHandler(() => f.deps)(req(ok));
    assertEquals(r.status, expectedStatus);
    const j = await r.json();
    assertEquals(j.error.code, code);
    assert(!JSON.stringify(j).includes("Gemini"), "внутрішні деталі не віддаються клієнту");
    assertEquals(f.saved.length, 0);
    assertEquals(f.created.length, 0); // порожня розмова теж не створюється
  });
}

Deno.test("429: клієнту віддається retry_after_seconds і заголовок Retry-After", async () => {
  const f = fakeDeps({ script: [new LlmError("rate_limited", "Gemini HTTP 429", 429, "x", 53)] });
  const r = await makeHandler(() => f.deps)(req(ok));
  assertEquals(r.status, 429);
  assertEquals(r.headers.get("Retry-After"), "53");
  const j = await r.json();
  assertEquals(j.error.retry_after_seconds, 53);
  assert(j.error.message.includes("53"), "повідомлення називає час очікування");
});

Deno.test("429 без підказки Google: чекати 60 с за замовчуванням; значення обмежене 300 с", async () => {
  const a = await makeHandler(() => fakeDeps({ script: [new LlmError("rate_limited", "m", 429)] }).deps)(req(ok));
  assertEquals((await a.json()).error.retry_after_seconds, 60);
  const b = await makeHandler(() => fakeDeps({ script: [new LlmError("rate_limited", "m", 429, undefined, 9999)] }).deps)(req(ok));
  assertEquals((await b.json()).error.retry_after_seconds, 300);
});

Deno.test("detail від Google віддається лише в налагоджувальному режимі", async () => {
  const err = () => new LlmError("bad_request", "Gemini HTTP 400 INVALID_ARGUMENT", 400, "Unknown name x");
  const off = await (await makeHandler(() => fakeDeps({ script: [err()] }).deps)(req(ok))).json();
  assertEquals(off.debug, undefined);
  const on = await (await makeHandler(() => fakeDeps({ script: [err()], debug: true }).deps)(req(ok))).json();
  assertEquals(on.debug, { kind: "bad_request", status: 400, detail: "Unknown name x" });
});

Deno.test("збій БД -> 500 без витоку деталей", async () => {
  const r = await makeHandler(() => fakeDeps({ failDb: true }).deps)(req(ok));
  const t = await r.text();
  assertEquals(r.status, 500);
  assert(!t.includes("secret"), "витік деталей помилки");
});

// ---- налагоджувальний режим інструментів (етап 3, тимчасово) ----

Deno.test("debug_tool вимкнено: запит валідується як чат, модель не викликається", async () => {
  const f = fakeDeps();
  const r = await makeHandler(() => f.deps)(req({ debug_tool: "get_schedule", timezone: "Europe/Kyiv" }));
  assertEquals(r.status, 400); // немає message
  assertEquals(f.llm.requests.length, 0);
});

Deno.test("debug_tool увімкнено: виконує інструмент, не пише в БД і не викликає модель", async () => {
  const f = fakeDeps({ debug: true });
  const r = await makeHandler(() => f.deps)(req({ debug_tool: "get_medications", debug_args: {}, timezone: "Europe/Kyiv" }));
  assertEquals(r.status, 200);
  const j = await r.json();
  assertEquals(j.ok, true);
  assertEquals(j.result.count, 0);
  assertEquals(f.saved.length, 0);
  assertEquals(f.llm.requests.length, 0);
});

Deno.test("debug_tool увімкнено: без авторизації все одно 401", async () => {
  const r = await makeHandler(() => fakeDeps({ debug: true }).deps)(
    req({ debug_tool: "get_medications", timezone: "Europe/Kyiv" }, { auth: null }),
  );
  assertEquals(r.status, 401);
});

Deno.test("debug_tool: хибна timezone -> 400; невідомий інструмент -> ok:false", async () => {
  const h = makeHandler(() => fakeDeps({ debug: true }).deps);
  assertEquals((await h(req({ debug_tool: "get_medications", timezone: "Mars/X" }))).status, 400);
  const j = await (await h(req({ debug_tool: "drop_db", timezone: "Europe/Kyiv" }))).json();
  assertEquals(j.ok, false);
});