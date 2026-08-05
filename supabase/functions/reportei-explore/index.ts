// Supabase Edge Function: reportei-explore
//
// Function de USO ÚNICO (diagnóstico) — lista todos os projetos da conta
// Reportei e, para cada um, as integrações conectadas (redes sociais,
// Google Analytics, etc). Não grava nada no banco, só retorna o JSON pra
// a gente decidir o mapeamento projeto <-> empresa antes de montar o sync
// de verdade.
//
// Chamar assim, depois do deploy:
//   GET https://SEU-PROJETO.supabase.co/functions/v1/reportei-explore
//
// Secret necessário: REPORTEI_TOKEN

const REPORTEI_TOKEN = Deno.env.get("REPORTEI_TOKEN")!;
const BASE = "https://app.reportei.com/api/v2";

async function reporteiGet(path: string) {
  const resp = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${REPORTEI_TOKEN}` },
  });
  if (!resp.ok) {
    throw new Error(`${path} -> ${resp.status}: ${await resp.text()}`);
  }
  return resp.json();
}

Deno.serve(async (_req) => {
  try {
    const projectsResp = await reporteiGet("/projects?per_page=100");
    const projects = projectsResp.data ?? [];

    const result = [];
    for (const project of projects) {
      const integrationsResp = await reporteiGet(
        `/integrations?project_id=${project.id}&per_page=100`,
      );
      result.push({
        project_id: project.id,
        project_name: project.name,
        integrations: (integrationsResp.data ?? []).map((i: any) => ({
          integration_id: i.id,
          name: i.name,
          slug: i.slug,
          status: i.status,
        })),
      });
    }

    return new Response(JSON.stringify(result, null, 2), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(String(err), { status: 500 });
  }
});
