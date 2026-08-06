// Supabase Edge Function: reportei-explore
//
// v3: busca as integrações dos projetos "EDUCAÇÃO" (Faz + Planneta) e
// "VITAE" (Vitae Brasil + Solum Ambiental).
//
// Secret necessário: REPORTEI_TOKEN

const REPORTEI_TOKEN = Deno.env.get("REPORTEI_TOKEN")!;
const BASE = "https://app.reportei.com/api/v2";

const PROJECT_NAMES = ["EDUCAÇÃO", "VITAE"];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reporteiGet(path: string) {
  const resp = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${REPORTEI_TOKEN}` },
  });

  if (resp.status === 429) {
    const retryAfter = Number(resp.headers.get("Retry-After") ?? "5");
    await sleep((retryAfter + 1) * 1000);
    return reporteiGet(path);
  }

  if (!resp.ok) {
    throw new Error(`${path} -> ${resp.status}: ${await resp.text()}`);
  }
  return resp.json();
}

Deno.serve(async (_req) => {
  try {
    const result = [];

    for (const name of PROJECT_NAMES) {
      const projectsResp = await reporteiGet(
        `/projects?q=${encodeURIComponent(name)}&per_page=10`,
      );
      const matches = projectsResp.data ?? [];
      await sleep(400);

      const projectEntries = [];
      for (const project of matches) {
        const integrationsResp = await reporteiGet(
          `/integrations?project_id=${project.id}&per_page=100`,
        );
        projectEntries.push({
          project_id: project.id,
          project_name: project.name,
          integrations: (integrationsResp.data ?? []).map((i: any) => ({
            integration_id: i.id,
            name: i.name,
            slug: i.slug,
            status: i.status,
          })),
        });
        await sleep(400);
      }

      result.push({ searched_name: name, matches: projectEntries });
    }

    return new Response(JSON.stringify(result, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(String(err), { status: 500 });
  }
});
