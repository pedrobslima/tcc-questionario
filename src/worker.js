/**
 * Worker do questionário. Os arquivos de public/ são servidos como static assets;
 * só POST /api/enviar chega aqui. Grava no D1 (binding DB) e responde JSON:
 *   200 {ok:true} quando gravou; 4xx {ok:false, erro} quando rejeitou; 500 em falha interna.
 * O site só tira um envio da fila depois de receber {ok:true}.
 */
const ESCOLHAS = ["m1", "m2", "empate", "nao_sei"];
const UUID_RE = /^[0-9a-f-]{16,64}$/i;

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});
const erro = (status, msg) => json(status, { ok: false, erro: msg });
const str = (v, n = 200) => String(v == null ? "" : v).slice(0, n);

async function enviar(req, db) {
  let p;
  try { p = await req.json(); } catch { return erro(400, "JSON inválido"); }
  const uuid = str(p.uuid, 64);
  if (!UUID_RE.test(uuid)) return erro(400, "uuid inválido");
  const now = new Date().toISOString();

  if (p.tipo === "participante") {
    if (p.consentimento !== true) return erro(400, "consentimento ausente");
    if (!["sim", "nao"].includes(p.familiarizado)) return erro(400, "familiarizado inválido");
    // Reenvio do mesmo participante não altera o registro original.
    await db.prepare(
      "INSERT INTO participantes (uuid, secretaria, familiarizado, consentimento, criado_em) VALUES (?, ?, ?, 1, ?) ON CONFLICT(uuid) DO NOTHING"
    ).bind(uuid, str(p.secretaria), p.familiarizado, now).run();
    return json(200, { ok: true });
  }

  const part = await db.prepare("SELECT finalizado_em FROM participantes WHERE uuid = ?").bind(uuid).first();
  if (!part) return erro(404, "participante desconhecido");

  if (p.tipo === "resposta") {
    if (part.finalizado_em) return erro(409, "questionário já finalizado");
    const itens = Array.isArray(p.itens) ? p.itens.slice(0, 3) : [];
    const qid = Number(p.query_id);
    if (!Number.isInteger(qid)) return erro(400, "query_id inválido");
    if (!["m1", "m2"].includes(p.metodo_A)) return erro(400, "metodo_A inválido");
    if (!ESCOLHAS.includes(p.geral) || !itens.every(i => i && ESCOLHAS.includes(i.escolha))) return erro(400, "escolha inválida");
    const it = i => itens[i] ? [Number(itens[i].rank), itens[i].escolha] : [null, null];
    await db.prepare(
      `INSERT INTO respostas (uuid, query_id, metodo_A, rank_1, escolha_1, rank_2, escolha_2, rank_3, escolha_3, geral, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(uuid, query_id) DO UPDATE SET
         metodo_A = excluded.metodo_A, rank_1 = excluded.rank_1, escolha_1 = excluded.escolha_1,
         rank_2 = excluded.rank_2, escolha_2 = excluded.escolha_2, rank_3 = excluded.rank_3,
         escolha_3 = excluded.escolha_3, geral = excluded.geral, atualizado_em = excluded.atualizado_em`
    ).bind(uuid, qid, p.metodo_A, ...it(0), ...it(1), ...it(2), p.geral, now).run();
    return json(200, { ok: true });
  }

  if (p.tipo === "finalizar") {
    // Finalizar de novo é idempotente: mantém a primeira data.
    await db.prepare("UPDATE participantes SET finalizado_em = COALESCE(finalizado_em, ?) WHERE uuid = ?").bind(now, uuid).run();
    return json(200, { ok: true });
  }
  return erro(400, "tipo desconhecido");
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/api/enviar") return erro(404, "rota inexistente");
    if (req.method !== "POST") return erro(405, "use POST");
    try { return await enviar(req, env.DB); }
    catch (e) { console.error(e); return erro(500, "falha interna ao gravar"); }
  },
};
