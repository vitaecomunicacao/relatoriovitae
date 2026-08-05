// Supabase Edge Function: rd-webhook
//
// Recebe as chamadas em tempo real do RD Station Marketing sempre que um
// contato converte (WEBHOOK.CONVERTED) ou é marcado como oportunidade
// (WEBHOOK.MARKED_OPPORTUNITY). Cadastrada via rd-register-webhook.
//
// URL cadastrada no RD Station, uma por conta:
//   https://SEU-PROJETO.supabase.co/functions/v1/rd-webhook?account=faz
//   https://SEU-PROJETO.supabase.co/functions/v1/rd-webhook?account=albert
//   https://SEU-PROJETO.supabase.co/functions/v1/rd-webhook?account=namura
//
// Grava o evento bruto em rd_events e atualiza a agregação diária em
// rd_leads (leads_count para conversões, mql_count para oportunidades).

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const ALLOWED_ACCOUNTS = new Set(["faz", "albert", "namura"]);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Método não suportado.", { status: 405 });
  }

  const url = new URL(req.url);
  const account = url.searchParams.get("account");
  if (!account || !ALLOWED_ACCOUNTS.has(account)) {
    return new Response("Conta desconhecida ou ausente na URL.", {
      status: 400,
    });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response("Corpo da requisição não é um JSON válido.", {
      status: 400,
    });
  }

  const eventType: string = payload?.event_type ?? "UNKNOWN";
  const contact = payload?.contact ?? {};

  await supabase.from("rd_events").insert({
    company_id: account,
    event_type: eventType,
    conversion_identifier: payload?.event_identifier ?? null,
    contact_email: contact.email ?? null,
    contact_name: contact.name ?? null,
    payload,
  });

  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await supabase
    .from("rd_leads")
    .select("*")
    .eq("company_id", account)
    .eq("date", today)
    .maybeSingle();

  const leadsCount = (existing?.leads_count ?? 0) +
    (eventType === "WEBHOOK.CONVERTED" ? 1 : 0);
  const mqlCount = (existing?.mql_count ?? 0) +
    (eventType === "WEBHOOK.MARKED_OPPORTUNITY" ? 1 : 0);
  const conversionRate = leadsCount > 0
    ? Math.round((mqlCount / leadsCount) * 10000) / 100
    : 0;

  await supabase.from("rd_leads").upsert({
    company_id: account,
    date: today,
    leads_count: leadsCount,
    mql_count: mqlCount,
    conversion_rate: conversionRate,
  });

  return new Response("ok", { status: 200 });
});
