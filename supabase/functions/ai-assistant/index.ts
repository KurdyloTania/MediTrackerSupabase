// Точка входу Edge Function `ai-assistant`.
// Підключає справжній Supabase до handler-а.
// Supabase збирає функцію на сервері й не підтримує мапу імпортів з deno.json,
// тому тут потрібен прямий префікс npm:. Правило лінтера вимикаємо свідомо.
// deno-lint-ignore-file no-import-prefix
import { createClient } from "npm:@supabase/supabase-js@2";
import { type Deps, makeHandler, type SavedMessage } from "./handler.ts";
import type { DataSource } from "./tools/executor.ts";
import { createGeminiClient } from "./llm/gemini.ts";
import type { HistoryMessage } from "./llm/agent.ts";
import type { DoseLogRow, MedicationRow } from "./domain/schedule.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEBUG_TOOLS = Deno.env.get("AI_DEBUG_TOOLS") === "1";
// Ключ Gemini зберігається ЛИШЕ в секретах Supabase (не в коді й не в EXPO_PUBLIC_*).
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ?? "";
// gemini-3.6-flash виводиться з експлуатації (Google Cloud: 19.11.2026), тому за замовчуванням 3.8.
const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-3.8-flash";

// Необов'язково: GEMINI_THINKING_LEVEL=low|minimal|medium|high (менше роздумів = швидші відповіді)
const level = Deno.env.get("GEMINI_THINKING_LEVEL");
const THINKING_LEVEL = level === "minimal" || level === "low" || level === "medium" || level === "high"
  ? level
  : undefined;

const llm = createGeminiClient({ apiKey: GEMINI_API_KEY, model: GEMINI_MODEL, thinkingLevel: THINKING_LEVEL });

const PAGE = 1000; // ліміт PostgREST на один запит
const MAX_PAGES = 10;

// Service-клієнт: лише для запису в ai_*. user_id завжди береться з перевіреного JWT.
const serviceDb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function createDeps(accessToken: string): Deps {
  // Клієнт від імені користувача: усі читання проходять через RLS.
  const userDb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Читання медичних даних: ТІЛЬКИ через userDb, тобто під RLS користувача.
  const data: DataSource = {
    async listMedications() {
      const { data, error } = await userDb
        .from("medications")
        .select(
          "id, name, dosage, frequency, start_date, end_date, reminder_enabled, meal_timing, notes, stock_quantity, stock_unit, dose_per_intake",
        )
        .order("name");
      if (error) throw error;
      return (data ?? []) as MedicationRow[];
    },

    async listDoseLogs(fromIso, toIso) {
      const rows: DoseLogRow[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const { data, error } = await userDb
          .from("dose_logs")
          .select("medication_id, scheduled_time, taken_at, status")
          .gte("scheduled_time", fromIso)
          .lt("scheduled_time", toIso)
          .order("scheduled_time")
          .range(page * PAGE, page * PAGE + PAGE - 1);
        if (error) throw error;
        rows.push(...((data ?? []) as DoseLogRow[]));
        if (!data || data.length < PAGE) break;
      }
      return rows;
    },
  };

  return {
    data,
    llm,
    now: () => new Date(),
    debugTools: DEBUG_TOOLS,
    async recentMessages(conversationId, limit) {
      const { data, error } = await userDb
        .from("ai_messages")
        .select("role, content")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return ((data ?? []) as HistoryMessage[]).reverse();
    },
    async authenticate() {
      const { data, error } = await userDb.auth.getUser(accessToken);
      if (error || !data.user) return null;
      return { id: data.user.id };
    },

    async conversationExists(conversationId) {
      const { data, error } = await userDb
        .from("ai_conversations")
        .select("id")
        .eq("id", conversationId)
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    },

    async createConversation(userId, title) {
      const { data, error } = await serviceDb
        .from("ai_conversations")
        .insert({ user_id: userId, title })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },

    async saveMessage(userId, conversationId, role, content, toolCalls) {
      const { data, error } = await serviceDb
        .from("ai_messages")
        .insert({
          user_id: userId,
          conversation_id: conversationId,
          role,
          content,
          tool_calls: toolCalls ?? null,
        })
        .select("id, role, content, created_at")
        .single();
      if (error) throw error;
      return data as SavedMessage;
    },
  };
}

Deno.serve(makeHandler(createDeps));