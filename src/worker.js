/**
 * Worker do questionário. Os arquivos de public/ são servidos como static assets
 * (inclusive /answers, que é public/answers.html); só /api/* chega aqui. Grava no D1 (binding DB) e responde JSON:
 *   200 {ok:true, ...} quando deu certo; 4xx {ok:false, erro} quando rejeitou; 500 em falha interna.
 * Rotas:
 *   POST /api/entrar     {uuid, nome, nascimento, secretaria, familiarizado, consentimento}
 *                        -> {ok, uuid, finalizado}. Cria o participante com o uuid enviado. Reenvio com o mesmo
 *                        uuid (ex.: resposta perdida na rede) é aceito. Se (nome normalizado, nascimento) já existe
 *                        com OUTRO uuid, responde 500 {ok:false, erro:"067"}: parece um erro comum, mas indica
 *                        alguém tentando entrar com a identidade de um participante já registrado (não é gravado).
 *   GET  /api/respostas?uuid=...  -> {ok, finalizado, respostas: [linhas da tabela respostas]}
 *   POST /api/enviar     {tipo: "resposta" | "finalizar", uuid, ...} (fila do site; só sai da fila com {ok:true})
 */
const ESCOLHAS = ["m1", "m2", "empate", "nao_sei"];
const ORDEM = ["sim", "parcial", "nao", "nao_sei"];
const UUID_RE = /^[0-9a-f-]{16,64}$/i;

const json = (status, body) => new Response(JSON.stringify(body), {
  status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});
const erro = (status, msg) => json(status, { ok: false, erro: msg });
const str = (v, n = 200) => String(v == null ? "" : v).slice(0, n);
// Nome para comparação: sem acentos, minúsculas, espaços repetidos viram um.
const chaveNome = n => n.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
function dataValida(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const t = new Date(d + "T00:00:00Z");
  return !isNaN(t) && t.toISOString().slice(0, 10) === d && d >= "1900-01-01" && t <= new Date();
}

async function entrar(req, db) {
  let p;
  try { p = await req.json(); } catch { return erro(400, "JSON inválido"); }
  const uuid = str(p.uuid, 64), nome = str(p.nome).replace(/\s+/g, " ").trim(), nasc = str(p.nascimento, 10);
  if (!UUID_RE.test(uuid)) return erro(400, "uuid inválido");
  if (nome.length < 3) return erro(400, "nome inválido");
  if (!dataValida(nasc)) return erro(400, "data de nascimento inválida");
  if (p.consentimento !== true) return erro(400, "consentimento ausente");
  if (!["sim", "nao"].includes(p.familiarizado)) return erro(400, "familiarizado inválido");
  const chave = chaveNome(nome);
  // Insere só se (nome_chave, nascimento) ainda não existe; depois lê quem ficou registrado.
  const ins = await db.prepare(
    `INSERT INTO participantes (uuid, nome, nome_chave, nascimento, secretaria, familiarizado, consentimento, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?) ON CONFLICT DO NOTHING`
  ).bind(uuid, nome, chave, nasc, str(p.secretaria), p.familiarizado, new Date().toISOString()).run();
  const part = await db.prepare("SELECT uuid, finalizado_em FROM participantes WHERE nome_chave = ? AND nascimento = ?")
    .bind(chave, nasc).first();
  if (!part) return erro(409, "uuid já usado por outro participante");
  if (part.uuid !== uuid) return erro(500, "067");
  return json(200, { ok: true, uuid: part.uuid, finalizado: !!part.finalizado_em });
}

async function respostas(url, db) {
  const uuid = str(url.searchParams.get("uuid"), 64);
  if (!UUID_RE.test(uuid)) return erro(400, "uuid inválido");
  const part = await db.prepare("SELECT finalizado_em FROM participantes WHERE uuid = ?").bind(uuid).first();
  if (!part) return erro(404, "participante desconhecido");
  const { results } = await db.prepare(
    "SELECT query_id, metodo_A, rank_1, escolha_1, rank_2, escolha_2, rank_3, escolha_3, geral, ordem_m1, ordem_m2, atualizado_em FROM respostas WHERE uuid = ? ORDER BY query_id"
  ).bind(uuid).all();
  return json(200, { ok: true, finalizado: !!part.finalizado_em, respostas: results });
}

async function enviar(req, db) {
  let p;
  try { p = await req.json(); } catch { return erro(400, "JSON inválido"); }
  const uuid = str(p.uuid, 64);
  if (!UUID_RE.test(uuid)) return erro(400, "uuid inválido");
  const now = new Date().toISOString();

  const part = await db.prepare("SELECT finalizado_em FROM participantes WHERE uuid = ?").bind(uuid).first();
  if (!part) return erro(404, "participante desconhecido");

  if (p.tipo === "resposta") {
    if (part.finalizado_em) return erro(409, "questionário já finalizado");
    const itens = Array.isArray(p.itens) ? p.itens.slice(0, 3) : [];
    const qid = Number(p.query_id);
    if (!Number.isInteger(qid)) return erro(400, "query_id inválido");
    if (!["m1", "m2"].includes(p.metodo_A)) return erro(400, "metodo_A inválido");
    if (!ESCOLHAS.includes(p.geral) || !itens.every(i => i && ESCOLHAS.includes(i.escolha))) return erro(400, "escolha inválida");
    if (!ORDEM.includes(p.ordem_m1) || !ORDEM.includes(p.ordem_m2)) return erro(400, "resposta sobre a ordem inválida");
    const it = i => itens[i] ? [Number(itens[i].rank), itens[i].escolha] : [null, null];
    await db.prepare(
      `INSERT INTO respostas (uuid, query_id, metodo_A, rank_1, escolha_1, rank_2, escolha_2, rank_3, escolha_3, geral, ordem_m1, ordem_m2, atualizado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(uuid, query_id) DO UPDATE SET
         metodo_A = excluded.metodo_A, rank_1 = excluded.rank_1, escolha_1 = excluded.escolha_1,
         rank_2 = excluded.rank_2, escolha_2 = excluded.escolha_2, rank_3 = excluded.rank_3,
         escolha_3 = excluded.escolha_3, geral = excluded.geral, ordem_m1 = excluded.ordem_m1,
         ordem_m2 = excluded.ordem_m2, atualizado_em = excluded.atualizado_em`
    ).bind(uuid, qid, p.metodo_A, ...it(0), ...it(1), ...it(2), p.geral, p.ordem_m1, p.ordem_m2, now).run();
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
    const rotas = {
      "/api/entrar": ["POST", () => entrar(req, env.DB)],
      "/api/respostas": ["GET", () => respostas(url, env.DB)],
      "/api/enviar": ["POST", () => enviar(req, env.DB)],
    };
    const r = rotas[url.pathname];
    if (!r) return erro(404, "rota inexistente");
    if (req.method !== r[0]) return erro(405, `use ${r[0]}`);
    try { return await r[1](); }
    catch (e) { console.error(e); return erro(500, "falha interna"); }
  },
};
