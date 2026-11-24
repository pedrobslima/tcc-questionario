/**
 * Recebe as respostas do questionário (POST com JSON em text/plain) e grava na planilha onde o script está.
 * Abas criadas automaticamente:
 *   participantes: uuid | secretaria | familiarizado | consentimento | criado_em | finalizado_em
 *   respostas:     uuid | query_id | metodo_A | rank_1 | escolha_1 | rank_2 | escolha_2 | rank_3 | escolha_3 | geral | atualizado_em
 * Escolhas: chave do método (m1/m2), "empate" ou "nao_sei". Uma linha por (uuid, query_id): reenviar atualiza a linha.
 * Depois de "finalizar", novas respostas desse uuid são ignoradas.
 */
const SHEETS = {
  participantes: ["uuid", "secretaria", "familiarizado", "consentimento", "criado_em", "finalizado_em"],
  respostas: ["uuid", "query_id", "metodo_A", "rank_1", "escolha_1", "rank_2", "escolha_2", "rank_3", "escolha_3", "geral", "atualizado_em"],
};

function sheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(SHEETS[name]); sh.setFrozenRows(1); }
  return sh;
}

function findRow_(sh, match) {
  const vals = sh.getDataRange().getValues();
  for (let r = 1; r < vals.length; r++) if (match(vals[r])) return r + 1;
  return 0;
}

const str_ = (v, n) => String(v == null ? "" : v).slice(0, n || 200);

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const p = JSON.parse(e.postData.contents);
    const uuid = str_(p.uuid, 64);
    if (!/^[0-9a-f-]{16,64}$/i.test(uuid)) return out_("uuid inválido");
    const part = sheet_("participantes");
    const pr = findRow_(part, r => r[0] === uuid);
    const now = new Date();

    if (p.tipo === "participante") {
      if (!pr) part.appendRow([uuid, str_(p.secretaria), str_(p.familiarizado, 10), p.consentimento === true, now, ""]);
      return out_("ok");
    }
    if (!pr) return out_("participante desconhecido");
    if (part.getRange(pr, 6).getValue()) return out_("já finalizado");

    if (p.tipo === "resposta") {
      const ok = c => ["m1", "m2", "empate", "nao_sei"].indexOf(c) >= 0;
      const itens = (p.itens || []).slice(0, 3);
      if (!ok(p.geral) || !itens.every(i => ok(i.escolha))) return out_("escolha inválida");
      const row = [uuid, Number(p.query_id), str_(p.metodo_A, 10)];
      for (let i = 0; i < 3; i++) row.push(itens[i] ? Number(itens[i].rank) : "", itens[i] ? itens[i].escolha : "");
      row.push(p.geral, now);
      const sh = sheet_("respostas");
      const r = findRow_(sh, v => v[0] === uuid && Number(v[1]) === Number(p.query_id));
      if (r) sh.getRange(r, 1, 1, row.length).setValues([row]); else sh.appendRow(row);
      return out_("ok");
    }
    if (p.tipo === "finalizar") { part.getRange(pr, 6).setValue(now); return out_("ok"); }
    return out_("tipo desconhecido");
  } finally {
    lock.releaseLock();
  }
}

function out_(msg) { return ContentService.createTextOutput(msg); }
