// Смоук-тест Edge Function на ВАШОМУ Supabase.
// Запуск з кореня проєкту (Node 18+):
//   node scripts/smoke-test-ai.mjs you@email.com YourPassword
// URL та anon-ключ береться з .env (EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY).
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const anon = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const [email, password] = process.argv.slice(2);
if (!url || !anon || !email || !password) {
  console.error("Використання: node scripts/smoke-test-ai.mjs email password");
  process.exit(1);
}

const supabase = createClient(url, anon);
const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
if (authErr) { console.error("Вхід не вдався:", authErr.message); process.exit(1); }
const token = auth.session.access_token;

async function call(label, body, bearer = token) {
  const r = await fetch(`${url}/functions/v1/ai-assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anon, ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  console.log(`\n[${label}] HTTP ${r.status}\n${text}`);
  try { return JSON.parse(text); } catch { return null; }
}

const tz = "Europe/Kyiv";
const first = await call("1. нова розмова (очікується 200)", { message: "Привіт!", timezone: tz });
if (first?.conversation_id) {
  await call("2. продовження розмови (очікується 200)", { message: "Ще раз", timezone: tz, conversation_id: first.conversation_id });
}
await call("3. порожнє повідомлення (очікується 400)", { message: "", timezone: tz });
await call("4. чужа/неіснуюча розмова (очікується 404)", { message: "x", timezone: tz, conversation_id: "00000000-0000-4000-8000-000000000000" });
await call("5. без токена користувача, лише anon (очікується 401)", { message: "x", timezone: tz }, anon);

console.log("\nПеревірте також у Supabase -> Table Editor: ai_conversations та ai_messages мають нові рядки.");
