// Supabase Edge Function: admin-toggle-active
//
// Só admins podem chamar. Ativa ou desativa o acesso de um usuário
// (não deleta a conta, só bloqueia o login) e registra em audit_log.
//
// verify_jwt = true (padrão — precisa estar logado)


import { createClient } from "jsr:@supabase/supabase-js@2";
import { getCaller } from "../_shared/get-caller.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

Deno.serve(async (req) => {
  const caller = await getCaller(req, supabase);
  if (!caller || caller.role !== "admin") {
    return new Response(JSON.stringify({ error: "Acesso restrito a administradores." }), { status: 403 });
  }

  const { userId, isActive } = await req.json().catch(() => ({}));
  if (!userId || typeof isActive !== "boolean") {
    return new Response(JSON.stringify({ error: "Parâmetros inválidos." }), { status: 400 });
  }

  const { error } = await supabase.from("profiles").update({ is_active: isActive }).eq("id", userId);
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const { data: target } = await supabase.from("profiles").select("email").eq("id", userId).single();

  await supabase.from("audit_log").insert({
    actor_id: caller.id, actor_email: caller.email,
    action: isActive ? "activate_user" : "deactivate_user",
    target_email: target?.email ?? null,
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
