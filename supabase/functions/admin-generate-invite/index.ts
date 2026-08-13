// Supabase Edge Function: admin-generate-invite
//
// Só admins podem chamar. Gera um código de convite novo (role member ou
// admin, à escolha) e registra a ação em audit_log.
//
// verify_jwt = true (padrão — precisa estar logado)

import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCaller } from "../_shared/get-caller.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const caller = await getCaller(req, supabase);
  if (!caller || caller.role !== "admin") {
    return new Response(JSON.stringify({ error: "Acesso restrito a administradores." }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const role = body.role === "admin" ? "admin" : "member";

  const code = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();

  const { error } = await supabase.from("invite_codes").insert({
    code, role, created_by: caller.id,
  });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  await supabase.from("audit_log").insert({
    actor_id: caller.id, actor_email: caller.email, action: "generate_invite",
    details: { code, role },
  });

  return new Response(JSON.stringify({ code, role }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
