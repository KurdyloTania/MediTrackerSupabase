// Запуск: deno test handler_test.ts
import { makeHandler, type Deps, type Role } from "./handler.ts";

const USER = { id: "11111111-1111-1111-1111-111111111111" };
const OWN_CONV = "c1000000-0000-4000-8000-000000000001";
const FOREIGN_CONV = "c2000000-0000-4000-8000-000000000002";

function fakeDeps(opts: { user?: { id: string } | null; failDb?: boolean } = {}) {
  const saved: { role: Role; content: string; conv: string }[] = [];
  const created: string[] = [];
  const deps: Deps = {
    authenticate: () => Promise.resolve(opts.user === undefined ? USER : opts.user),
    conversationExists: (id) => {
      if (opts.failDb) return Promise.reject(new Error("db secret details"));
      return Promise.resolve(id === OWN_CONV);
    },
    createConversation: (_u, title) => {
      if (opts.failDb) return Promise.reject(new Error("db secret details"));
      created.push(title);
      return Promise.resolve("c3000000-0000-4000-8000-000000000003");
    },
    saveMessage: (_u, conv, role, content) => {
      saved.push({ role, content, conv });
      return Promise.resolve({ id: crypto.randomUUID(), role, content, created_at: new Date().toISOString() });
    },
  };
  return { deps, saved, created };
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

Deno.test("OPTIONS -> 204 з CORS", async () => {
  const h = makeHandler(() => fakeDeps().deps);
  const r = await h(req(null, { method: "OPTIONS", auth: null }));
  if (r.status !== 204) throw new Error(`status ${r.status}`);
  if (!r.headers.get("Access-Control-Allow-Origin")) throw new Error("no CORS");
});

Deno.test("GET -> 405", async () => {
  const h = makeHandler(() => fakeDeps().deps);
  const r = await h(req(null, { method: "GET" }));
  if (r.status !== 405) throw new Error(`status ${r.status}`);
});

Deno.test("без Authorization -> 401", async () => {
  const h = makeHandler(() => fakeDeps().deps);
  const r = await h(req(ok, { auth: null }));
  if (r.status !== 401) throw new Error(`status ${r.status}`);
});

Deno.test("недійсний токен -> 401", async () => {
  const h = makeHandler(() => fakeDeps({ user: null }).deps);
  const r = await h(req(ok));
  if (r.status !== 401) throw new Error(`status ${r.status}`);
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
  Deno.test(`валідація: ${name} -> 400`, async () => {
    const { deps, saved } = fakeDeps();
    const r = await makeHandler(() => deps)(req(body));
    if (r.status !== 400) throw new Error(`status ${r.status}`);
    if (saved.length) throw new Error("не повинно нічого зберігатись");
  });
}

Deno.test("битий JSON -> 400", async () => {
  const r = await makeHandler(() => fakeDeps().deps)(req("{не json"));
  if (r.status !== 400) throw new Error(`status ${r.status}`);
});

Deno.test("завеликий body -> 413", async () => {
  const r = await makeHandler(() => fakeDeps().deps)(req({ ...ok, pad: "x".repeat(20000) }));
  if (r.status !== 413) throw new Error(`status ${r.status}`);
});

Deno.test("нова розмова: створюється, зберігаються 2 повідомлення, заголовок <=60", async () => {
  const { deps, saved, created } = fakeDeps();
  const long = "Я".repeat(100);
  const r = await makeHandler(() => deps)(req({ ...ok, message: long }));
  if (r.status !== 200) throw new Error(`status ${r.status}`);
  const j = await r.json();
  if (!j.conversation_id || j.message.role !== "assistant") throw new Error("bad body");
  if (created.length !== 1 || created[0].length !== 60) throw new Error("title");
  if (saved.map((s) => s.role).join() !== "user,assistant") throw new Error("order");
});

Deno.test("існуюча власна розмова -> 200 без створення нової", async () => {
  const { deps, created } = fakeDeps();
  const r = await makeHandler(() => deps)(req({ ...ok, conversation_id: OWN_CONV }));
  if (r.status !== 200 || created.length) throw new Error("unexpected");
  if ((await r.json()).conversation_id !== OWN_CONV) throw new Error("conv id");
});

Deno.test("чужа розмова -> 404 і нічого не зберігається", async () => {
  const { deps, saved } = fakeDeps();
  const r = await makeHandler(() => deps)(req({ ...ok, conversation_id: FOREIGN_CONV }));
  if (r.status !== 404 || saved.length) throw new Error(`status ${r.status}`);
});

Deno.test("збій БД -> 500 без витоку деталей", async () => {
  const r = await makeHandler(() => fakeDeps({ failDb: true }).deps)(req(ok));
  const t = await r.text();
  if (r.status !== 500) throw new Error(`status ${r.status}`);
  if (t.includes("secret")) throw new Error("витік деталей помилки");
});