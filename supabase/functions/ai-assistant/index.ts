// РўРѕС‡РєР° РІС…РѕРґСѓ Edge Function `ai-assistant`.
// РџС–РґРєР»СЋС‡Р°С” СЃРїСЂР°РІР¶РЅС–Р№ Supabase РґРѕ handler-Р°.
import { createClient } from "npm:@supabase/supabase-js@2";
import { type Deps, makeHandler, type SavedMessage } from "./handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Service-РєР»С–С”РЅС‚: Р»РёС€Рµ РґР»СЏ Р·Р°РїРёСЃСѓ РІ ai_*. user_id Р·Р°РІР¶РґРё Р±РµСЂРµС‚СЊСЃСЏ Р· РїРµСЂРµРІС–СЂРµРЅРѕРіРѕ JWT.
const serviceDb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function createDeps(accessToken: string): Deps {
  // РљР»С–С”РЅС‚ РІС–Рґ С–РјРµРЅС– РєРѕСЂРёСЃС‚СѓРІР°С‡Р°: СѓСЃС– С‡РёС‚Р°РЅРЅСЏ РїСЂРѕС…РѕРґСЏС‚СЊ С‡РµСЂРµР· RLS.
  const userDb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
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

    async saveMessage(userId, conversationId, role, content) {
      const { data, error } = await serviceDb
        .from("ai_messages")
        .insert({
          user_id: userId,
          conversation_id: conversationId,
          role,
          content,
        })
        .select("id, role, content, created_at")
        .single();
      if (error) throw error;
      return data as SavedMessage;
    },
  };
}

Deno.serve(makeHandler(createDeps));
