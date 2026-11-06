// Перевірка інструментів асистента на ВАШИХ реальних даних (етап 3).
// Потрібно, щоб функція була задеплоєна з секретом AI_DEBUG_TOOLS=1.
//
// Запуск з кореня проєкту (Node 18+):
//   node scripts/smoke-test-tools.mjs your@email.com
// Пароль запитає скрипт (не потрапляє в історію команд). Або змінна AI_TEST_PASSWORD.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env", "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);
const url = env.EXPO_PUBLIC_SUPABASE_URL;
const anon = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const email = process.argv[2];
if (!url || !anon || !email) {
  console.error("Використання: node scripts/smoke-test-tools.mjs email");
  process.exit(1);
}

function askPassword(prompt) {
  if (process.env.AI_TEST_PASSWORD) return Promise.resolve(process.env.AI_TEST_PASSWORD);
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode?.(true); stdin.resume(); stdin.setEncoding("utf8");
    let buf = "";
    const onData = (ch) => {
      if (ch === "\r" || ch === "\n") {
        stdin.setRawMode?.(false); stdin.pause(); stdin.off("data", onData);
        process.stdout.write("\n"); resolve(buf);
      } else if (ch === "\u0003") process.exit(1);
      else if (ch === "\u007f" || ch === "\b") buf = buf.slice(0, -1);
      else buf += ch;
    };
    stdin.on("data", onData);
  });
}

const password = await askPassword("Пароль: ");
const supabase = createClient(url, anon);
const { data: auth, error } = await supabase.auth.signInWithPassword({ email, password });
if (error) { console.error("Вхід не вдався:", error.message); process.exit(1); }
const token = auth.session.access_token;
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Kyiv";
console.log(`Користувач увійшов. Часова зона: ${timezone}`);

async function tool(name, args = {}) {
  const r = await fetch(`${url}/functions/v1/ai-assistant`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anon, Authorization: `Bearer ${token}` },
    body: JSON.stringify({ debug_tool: name, debug_args: args, timezone }),
  });
  const text = await r.text();
  console.log(`\n===== ${name} ${JSON.stringify(args)}  ->  HTTP ${r.status} =====`);
  try { console.log(JSON.stringify(JSON.parse(text), null, 2)); } catch { console.log(text); }
}

await tool("get_medications");
await tool("get_schedule");
await tool("get_schedule", { part_of_day: "evening" });
await tool("get_statistics", { period: "last_7_days" });
await tool("get_dose_logs", { status: "missed" });
await tool("get_schedule", { date: "2026-02-30" }); // очікується ok:false

console.log("\nПорівняйте з екранами застосунку: 'Сьогодні' та 'Звіти'.");
process.exit(0);
