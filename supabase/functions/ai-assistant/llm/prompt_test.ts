import { assert } from "../testing.ts";
import { buildSystemInstruction } from "./prompt.ts";

const NOW = new Date("2026-11-04T23:30:00Z"); // 5 листопада 01:30 за Києвом

Deno.test("промпт: час за зоною користувача, а не за UTC", () => {
  const p = buildSystemInstruction(NOW, "Europe/Kyiv");
  assert(p.includes("2026-11-05 01:30"), "дата й час за Києвом");
  assert(p.includes("четвер"), "5 листопада 2026 - четвер");
  assert(!p.includes("2026-11-04 23:30"), "не UTC");
});

Deno.test("промпт: містить ключові правила безпеки", () => {
  const p = buildSystemInstruction(NOW, "Europe/Kyiv");
  for (const must of [
    "ЛИШЕ з інструментів", "recorded=false", "не лікар", "103 або 112",
    "лише читаєш", "ніколи не виконуй", "Не розкривай",
    "Не додавай і не вгадуй одиниці виміру", "не пояснюй, як це зробити",
  ]) assert(p.includes(must), `немає: ${must}`);
});