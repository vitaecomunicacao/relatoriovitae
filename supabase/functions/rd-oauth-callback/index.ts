// Supabase Edge Function: rd-oauth-callback
//
// Esta é a URL que você cadastra em "URLs de Callback" na App Publisher
// do RD Station. Ela recebe ?code=...&state=... depois que você autoriza
// uma conta, troca o code pelos tokens (access_token + refresh_token) e
// grava tudo na tabela rd_station_tokens.
//
// O "state" identifica qual conta está sendo autorizada. Você define esse
// valor na URL de autorização que você mesmo monta — use state=faz,
// state=albert ou state=namura.
//
// Secrets necessários (Project Settings > Edge Functions > Secrets):
//   RD_CLIENT_ID
//   RD_CLIENT_SECRET
//   SUPABASE_URL              (já injetado automaticamente pelo Supabase)
//   SUPABASE_SERVICE_ROLE_KEY (já injetado automaticamente pelo Supabase)

import { createClient } from "jsr:@supabase/supabase-js@2";

const RD_CLIENT_ID = Deno.env.get("RD_CLIENT_ID")!;
const RD_CLIENT_SECRET = Deno.env.get("RD_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const ALLOWED_ACCOUNTS = new Set(["faz", "albert", "namura"]);

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code || !state) {
    return new Response(
      "Faltou 'code' ou 'state' na URL de callback.",
      { status: 400 },
    );
  }

  if (!ALLOWED_ACCOUNTS.has(state)) {
    return new Response(
      `Conta desconhecida: '${state}'. Use faz, albert ou namura.`,
      { status: 400 },
    );
  }

  const tokenResp = await fetch("https://api.rd.services/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: RD_CLIENT_ID,
      client_secret: RD_CLIENT_SECRET,
      code,
    }),
  });

  if (!tokenResp.ok) {
    const errText = await tokenResp.text();
    return new Response(
      `Erro ao trocar o code por tokens: ${errText}`,
      { status: 502 },
    );
  }

  const tokenData = await tokenResp.json();

  const expiresAt = new Date(
    Date.now() + tokenData.expires_in * 1000,
  ).toISOString();

  const { error } = await supabase
    .from("rd_station_tokens")
    .upsert({
      account_name: state,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    return new Response(`Erro ao salvar no banco: ${error.message}`, {
      status: 500,
    });
  }

  return new Response(
    `Conta '${state}' autorizada e tokens salvos com sucesso. Pode fechar esta aba.`,
    { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } },
  );
});
