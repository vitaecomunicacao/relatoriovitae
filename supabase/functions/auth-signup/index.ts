// Supabase Edge Function: auth-signup
//
// Cadastro público, mas só funciona com um código de convite válido e
// ainda não usado (gerado por um admin no painel). Cria o usuário no
// Supabase Auth, o perfil (com o role definido pelo convite), marca o
// convite como usado, e registra tudo em audit_log.
//
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (automáticos)
// verify_jwt = false (quem chama ainda não tem conta/sessão)


import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

Deno.serve(async (req) => {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Corpo da requisição inválido." }), { status: 400 });
  }

  const { email, password, inviteCode } = body;
  if (!email || !password || !inviteCode) {
    return new Response(JSON.stringify({ error: "Preencha e-mail, senha e código de convite." }), { status: 400 });
  }
  if (password.length < 8) {
    return new Response(JSON.stringify({ error: "A senha precisa ter pelo menos 8 caracteres." }), { status: 400 });
  }

  const { data: invite, error: inviteErr } = await supabase
    .from("invite_codes")
    .select("*")
    .eq("code", inviteCode.trim())
    .eq("active", true)
    .is("used_by", null)
    .maybeSingle();

  if (inviteErr || !invite) {
    return new Response(JSON.stringify({ error: "Código de convite inválido ou já utilizado." }), { status: 400 });
  }

  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true,
  });
  if (createErr || !created.user) {
    return new Response(JSON.stringify({ error: createErr?.message || "Erro ao criar usuário." }), { status: 400 });
  }

  await supabase.from("profiles").insert({
    id: created.user.id, email, role: invite.role, invited_by: invite.created_by,
  });

  await supabase.from("invite_codes").update({
    used_by: created.user.id, used_at: new Date().toISOString(), active: false,
  }).eq("code", invite.code);

  await supabase.from("audit_log").insert({
    actor_id: created.user.id, actor_email: email, action: "signup",
    target_email: email, details: { invite_code: invite.code, role: invite.role },
  });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { "Content-Type": "application/json" },
  });
});
