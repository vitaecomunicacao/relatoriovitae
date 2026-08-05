// supabase/functions/_shared/rd-token.ts
//
// Usado por qualquer Edge Function que precise chamar a API do RD Station
// em nome de uma das 3 contas (faz, albert, namura). Garante que o
// access_token usado está sempre válido, renovando via refresh_token
// automaticamente quando está perto de expirar (o access_token dura 24h).

export async function getValidAccessToken(
  supabase: any,
  accountName: string,
): Promise<string> {
  const clientId = Deno.env.get("RD_CLIENT_ID")!;
  const clientSecret = Deno.env.get("RD_CLIENT_SECRET")!;

  const { data, error } = await supabase
    .from("rd_station_tokens")
    .select("*")
    .eq("account_name", accountName)
    .single();

  if (error || !data) {
    throw new Error(
      `Conta '${accountName}' ainda não foi autorizada via OAuth2 (sem linha em rd_station_tokens).`,
    );
  }

  const expiresAt = new Date(data.expires_at).getTime();
  const fiveMinutes = 5 * 60 * 1000;

  // Ainda válido com folga de 5 minutos — usa o token atual.
  if (expiresAt - Date.now() > fiveMinutes) {
    return data.access_token;
  }

  // Perto de expirar (ou já expirado) — renova via refresh_token.
  const resp = await fetch("https://api.rd.services/auth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: data.refresh_token,
    }),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(
      `Falha ao renovar o access_token da conta '${accountName}': ${errText}`,
    );
  }

  const tokenData = await resp.json();
  const newExpiresAt = new Date(
    Date.now() + tokenData.expires_in * 1000,
  ).toISOString();

  await supabase.from("rd_station_tokens").upsert({
    account_name: accountName,
    access_token: tokenData.access_token,
    // Alguns fluxos de refresh não retornam um novo refresh_token;
    // nesse caso mantém o antigo.
    refresh_token: tokenData.refresh_token ?? data.refresh_token,
    expires_at: newExpiresAt,
    updated_at: new Date().toISOString(),
  });

  return tokenData.access_token;
}
