// Supabase Edge Function: rd-register-webhook
//
// Uso único por conta (faz, albert, namura), depois que a conta já foi
// autorizada via rd-oauth-callback. Registra DUAS assinaturas de webhook
// no RD Station Marketing:
//   - WEBHOOK.CONVERTED            -> disparado a cada conversão
//   - WEBHOOK.MARKED_OPPORTUNITY   -> disparado quando um lead é marcado
//                                     como oportunidade
// Ambas apontam para a Edge Function rd-webhook, com ?account=<nome> na URL
// para a rd-webhook saber de qual conta veio o evento.
//
// Chamar assim, uma vez por conta, depois do deploy:
//   GET https://SEU-PROJETO.supabase.co/functions/v1/rd-register-webhook?account=faz
//
// Secrets necessários: RD_CLIENT_ID, RD_CLIENT_SECRET, WEBHOOK_BASE_URL
// (a URL pública desta mesma pasta de functions, ex:
//  https://SEU-PROJETO.supabase.co/functions/v1)

import { createClient } from "jsr:@supabase/supabase-js@2";
import { getValidAccessToken } from "../_shared/rd-token.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const WEBHOOK_BASE_URL = Deno.env.get("WEBHOOK_BASE_URL")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const ALLOWED_ACCOUNTS = new Set(["faz", "albert", "namura"]);

async function createSubscription(
  accessToken: string,
  eventType: "WEBHOOK.CONVERTED" | "WEBHOOK.MARKED_OPPORTUNITY",
  targetUrl: string,
) {
  const resp = await fetch("https://api.rd.services/integrations/webhooks", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      event_type: eventType,
      entity_type: "CONTACT",
      url: targetUrl,
      http_method: "POST",
    }),
  });

  const body = await resp.text();
  return { status: resp.status, ok: resp.ok, body };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const account = url.searchParams.get("account");

  if (!account || !ALLOWED_ACCOUNTS.has(account)) {
    return new Response(
      "Informe ?account=faz, ?account=albert ou ?account=namura na URL.",
      { status: 400 },
    );
  }

  try {
    const accessToken = await getValidAccessToken(supabase, account);
    const targetUrl = `${WEBHOOK_BASE_URL}/rd-webhook?account=${account}`;

    const converted = await createSubscription(
      accessToken,
      "WEBHOOK.CONVERTED",
      targetUrl,
    );
    const opportunity = await createSubscription(
      accessToken,
      "WEBHOOK.MARKED_OPPORTUNITY",
      targetUrl,
    );

    return new Response(
      JSON.stringify({ account, converted, opportunity }, null, 2),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(String(err), { status: 500 });
  }
});
