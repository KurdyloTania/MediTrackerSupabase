// Спільні HTTP-хелпери для Edge Function.

export const corsHeaders: Record<string, string> = {
  // Мобільний застосунок CORS не потребує, але Expo Web (npm run web) - так.
  // На етапі 6 звузимо до конкретних origin.
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
): Response {
  return jsonResponse({ error: { code, message } }, status);
}