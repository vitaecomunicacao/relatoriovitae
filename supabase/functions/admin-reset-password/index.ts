// Supabase Edge Function: admin-reset-password
//
// Só admins podem chamar. Redefine a senha de outro usuário e registra
// a ação em audit_log.
//
// verify_jwt = true (padrão — precisa estar logado)

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function getCaller(req: Request) {
  const authHeader = req.headers.get("Authorization") || "";
  const jwt = authHeader.replace("Bearer ", "");
  if (!jwt) return null;
  const { data, error } = await supabase.auth.getUser(jwt);
  if (error || !data.user) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", data.user.id).single();
  return profile ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const caller = await getCaller(req);
  if (!caller || caller.role !== "admin") {
    return new Response(JSON.stringify({ error: "Acesso restrito a administradores." }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { userId, newPassword } = await req.json().catch(() => ({}));
  if (!userId || !newPassword || newPassword.length < 8) {
    return new Response(JSON.stringify({ error: "Informe o usuário e uma senha com pelo menos 8 caracteres." }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { error } = await supabase.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: target } = await supabase.from("profiles").select("email").eq("id", userId).single();

  await supabase.from("audit_log").insert({
    actor_id: caller.id, actor_email: caller.email, action: "reset_password",
    target_email: target?.email ?? null,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
