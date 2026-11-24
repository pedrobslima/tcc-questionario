// Questionário A/B: explicação m1 x m2 por item e-Fisco (query), formato "matriz completa".
// Fluxo: boas-vindas (termo + perfil) -> tutorial -> 1 tela por item e-Fisco (escolha por item Catmat + geral,
// revisão e confirmação) -> finalizar. Estado no localStorage; envios por fila para o Apps Script.
(function () {
  "use strict";
  const KEY = "tcc-questionario-v1";
  const ENDPOINT = (window.QUESTIONARIO_CONFIG || {}).endpoint || "";
  const CHOICES = [["A", "Explicação A"], ["B", "Explicação B"], ["empate", "Empate"], ["nao_sei", "Não sei responder"]];
  const LABEL = Object.fromEntries(CHOICES);
  const Q_ITEM = "Qual explicação (A ou B) deixa mais claro por que este item Catmat é similar ao item e-Fisco?";
  const Q_GERAL = "No geral, qual explicação (A ou B) deixa mais claro por que os itens Catmat foram sugeridos para este item e-Fisco?";
  const app = document.getElementById("app"), progress = document.getElementById("progress"), net = document.getElementById("net");
  let D = null, reviewing = false;

  // ---------------- estado ----------------
  const fresh = () => ({ stage: "welcome", uuid: null, qi: 0, sides: {}, answers: {}, pending: [] });
  let st = fresh();
  try { st = Object.assign(fresh(), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };

  // ---------------- envio ----------------
  // Fila em ordem: um envio só sai da fila quando o servidor responde {ok:true}.
  // Qualquer outra coisa (sem rede, erro 4xx/5xx, resposta inesperada) para a fila e mostra o motivo.
  let flushing = false, lastError = "";
  function send(payload) { st.pending.push(Object.assign({ enviado_em: new Date().toISOString() }, payload)); save(); flush(); }
  async function flush() {
    if (flushing) return;
    flushing = true;
    lastError = "";
    while (st.pending.length && ENDPOINT) {
      let res, body = null;
      try {
        res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(st.pending[0]) });
      } catch (e) { lastError = "sem conexão com o servidor"; break; }
      try { body = await res.json(); } catch (e) { /* resposta não-JSON */ }
      if (res.ok && body && body.ok === true) { st.pending.shift(); save(); continue; }
      lastError = `servidor recusou (${res.status}${body && body.erro ? ": " + body.erro : ""})`;
      break;
    }
    flushing = false;
    showNet();
  }
  function showNet() {
    const n = st.pending.length;
    net.hidden = n === 0;
    const why = !ENDPOINT ? "endpoint não configurado" : lastError;
    net.innerHTML = n ? `${n} resposta(s) ainda não enviada(s).${why ? ` <span class="warn">(${esc(why)})</span>` : ""} <button type="button" id="retry">Tentar de novo</button>` : "";
    const b = document.getElementById("retry"); if (b) b.onclick = flush;
  }
  window.addEventListener("online", flush);

  // ---------------- utilidades de renderização ----------------
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const num = x => x.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "always" });
  const num1 = x => x.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const rgba = (hex, a) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a.toFixed(3)})`;

  // cor por par/grupo, opacidade = 0.15 + 0.85 * |X| / máx |X| da explicação
  function styles(groups) {
    const out = new Map(), mx = Math.max(0, ...groups.map(g => Math.abs(g.v)));
    for (const g of groups) {
      const a = 0.15 + 0.85 * (mx > 0 ? Math.abs(g.v) / mx : 1);
      out.set(g.o, `background:${rgba(D.colors[(g.o - 1) % D.colors.length], a)};${a >= 0.5 ? "color:#000" : ""}`);
    }
    return out;
  }
  function hl(text, spans, sty) {
    const sp = [...spans].sort((x, y) => x[0] - y[0]);
    let out = "", pos = 0;
    for (const [a, b, o] of sp) { if (a < pos) continue; out += esc(text.slice(pos, a)) + `<mark style="${sty.get(o)}">${esc(text.slice(a, b))}</mark>`; pos = b; }
    return out + esc(text.slice(pos));
  }
  const mk = (sty, o, t) => `<mark style="${sty.get(o)}">${esc(t)}</mark>`;
  function lateral(groups, sty) {
    const lines = groups.map(g => {
      const s = g.s.map(t => t.t).join(", "), q = g.q ? g.q.t : "", v = `<span class="v">(${num(g.v)})</span>`;
      if (s && q) return `${mk(sty, g.o, s)} <span class="ar">←</span> ${v} <span class="ar">−</span> ${mk(sty, g.o, q)}`;
      if (s) return `${mk(sty, g.o, s)} <span class="ar">←</span> ${v}`;
      return `${v} <span class="ar">−</span> ${mk(sty, g.o, q)}`;
    });
    return `<div class="lat">${lines.length ? lines.map(l => `<div class="ln">${l}</div>`).join("") : '<div class="none">sem relações</div>'}</div>`;
  }
  function cell(q, s, m, side, i, chosen) {
    const groups = s.by[m], sty = styles(groups), sq = [], ss = [];
    for (const g of groups) {
      if (g.q) for (const [a, b] of g.q.sp) sq.push([a, b, g.o]);
      for (const t of g.s) for (const [a, b] of t.sp) ss.push([a, b, g.o]);
    }
    return `<div class="cell" role="button" tabindex="0" aria-pressed="${chosen}" data-i="${i}" data-c="${side}" aria-label="Escolher explicação ${side} para o item Catmat ${i + 1}">
      <div class="txt"><b>e-Fisco</b>${hl(q.text, sq, sty)}</div><div class="txt"><b>Catmat</b>${hl(s.text, ss, sty)}</div>${lateral(groups, sty)}</div>`;
  }

  // ---------------- telas ----------------
  function welcome() {
    progress.textContent = "";
    app.innerHTML = `<section class="panel">
      <h2>Bem-vindo(a)</h2>
      <p>Esta pesquisa faz parte de um trabalho de conclusão de curso sobre explicações para a similaridade entre itens de compras públicas. Você vai comparar duas explicações (A e B) para itens Catmat sugeridos a partir de itens do e-Fisco.</p>
      <p class="muted">São ${D.queries.length} itens e-Fisco, cada um com ${D.queries[0].suggestions.length} itens Catmat. Recomendamos usar um computador (a tela precisa de pelo menos 1000 px de largura).</p>
      <label class="field">A qual secretaria do estado você pertence?<input type="text" id="sec" autocomplete="off" maxlength="200"></label>
      <fieldset><legend>Você está familiarizado(a) com a montagem de mapa de preços?</legend><div class="opts">
        <label><input type="radio" name="fam" value="sim"> Sim</label><label><input type="radio" name="fam" value="nao"> Não</label></div></fieldset>
      <label class="check"><input type="checkbox" id="ok"><span>Aceito que apenas as respostas às perguntas feitas sejam utilizadas para a análise dos resultados da pesquisa, e entendo que nenhuma informação que possa ser usada para a minha identificação real será armazenada.</span></label>
      <div class="row"><button type="button" class="primary" id="go" disabled>Aceitar e começar</button></div>
    </section>`;
    const sec = document.getElementById("sec"), ok = document.getElementById("ok"), go = document.getElementById("go");
    const fam = () => (app.querySelector('input[name="fam"]:checked') || {}).value;
    const check = () => { go.disabled = !(ok.checked && sec.value.trim() && fam()); };
    app.querySelectorAll("input").forEach(el => el.addEventListener("input", check));
    app.querySelectorAll("input").forEach(el => el.addEventListener("change", check));
    go.onclick = () => {
      st.uuid = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
      for (const q of D.queries) st.sides[q.id] = Math.random() < 0.5 ? D.methods[0] : D.methods[1]; // método mostrado como A
      st.stage = "tutorial"; save();
      send({ tipo: "participante", uuid: st.uuid, secretaria: sec.value.trim(), familiarizado: fam(), consentimento: true });
      render();
    };
  }

  function tutorial() {
    progress.textContent = "Tutorial";
    app.innerHTML = `<section class="panel">
      <h2>Como responder</h2>
      <ol>
        <li>Cada tela mostra <b>um item e-Fisco</b> e os <b>itens Catmat</b> sugeridos para ele, em colunas, da maior para a menor similaridade (score de 0 a 100).</li>
        <li>Para cada item Catmat há duas explicações, nas linhas <b>A</b> e <b>B</b>. Elas destacam os termos que mais influenciaram a similaridade.</li>
        <li>Termos com a <b>mesma cor</b> no item e-Fisco e no item Catmat estão relacionados entre si. Quanto mais forte a cor, maior a influência.</li>
        <li>Abaixo dos textos, cada linha resume uma relação: <span class="fmt">termo Catmat ← (+X) − termo e-Fisco</span>. X é o quanto essa relação aumenta (+) ou diminui (−) o score. Uma linha com um lado só indica um termo que influenciou sozinho.</li>
        <li>Em cada coluna, <b>clique na explicação (A ou B)</b> que deixa mais claro por que aquele item Catmat é similar ao item e-Fisco. Se as duas forem equivalentes, use <b>Empate</b>; se não conseguir avaliar, use <b>Não sei responder</b>.</li>
        <li>Depois, responda à pergunta geral sobre qual explicação foi melhor para o item e-Fisco como um todo.</li>
        <li>Ao final de cada tela, você verá um resumo das suas respostas para confirmar. Você pode voltar a itens anteriores e mudar respostas até finalizar o questionário.</li>
      </ol>
      <p class="muted">As posições A e B mudam de um item e-Fisco para outro; não há uma resposta certa.</p>
      <div class="row"><button type="button" class="primary" id="go">Começar</button></div>
    </section>`;
    document.getElementById("go").onclick = () => { st.stage = "q"; st.qi = 0; save(); render(); };
  }

  const ans = q => (st.answers[q.id] = st.answers[q.id] || { itens: q.suggestions.map(() => null), geral: null, confirmado: false });
  const complete = a => a.itens.every(Boolean) && a.geral;

  function question() {
    const q = D.queries[st.qi], a = ans(q), mA = st.sides[q.id], mB = D.methods.find(m => m !== mA);
    progress.textContent = `Item e-Fisco ${st.qi + 1} de ${D.queries.length}`;
    if (reviewing) return review(q, a);
    let h = `<div class="box"><div class="lbl">Item e-Fisco</div><div class="txt">${esc(q.text)}</div></div>
      <p><b>${esc(Q_ITEM)}</b> <span class="muted">Clique na célula da explicação escolhida, ou use os botões abaixo de cada coluna.</span></p>
      <p class="narrow">Sua tela é estreita: role para o lado para ver todos os itens Catmat.</p>
      <div class="scroll"><div class="matrix"><div></div>`;
    h += q.suggestions.map((s, i) => `<div class="colhead">Item Catmat ${i + 1} <span>· score ${num1(s.score)}</span></div>`).join("");
    for (const [side, m] of [["A", mA], ["B", mB]]) {
      h += `<div class="rowlabel">Explicação ${side}</div>`;
      h += q.suggestions.map((s, i) => cell(q, s, m, side, i, a.itens[i] === side)).join("");
    }
    h += `<div></div>` + q.suggestions.map((s, i) => `<div class="foot">${CHOICES.slice(2).map(([c, l]) =>
      `<button type="button" data-i="${i}" data-c="${c}" aria-pressed="${a.itens[i] === c}">${l}</button>`).join("")}</div>`).join("");
    h += `</div></div>
      <fieldset><legend>${esc(Q_GERAL)}</legend><div class="opts">${CHOICES.map(([c, l]) =>
        `<label><input type="radio" name="geral" value="${c}" ${a.geral === c ? "checked" : ""}> ${l}</label>`).join("")}</div></fieldset>
      <div class="row end"><button type="button" id="prev" ${st.qi === 0 ? "disabled" : ""}>← Item e-Fisco anterior</button>
        <span class="row"><span class="muted" id="miss"></span><button type="button" class="primary" id="rev">Revisar respostas</button></span></div>`;
    app.innerHTML = h;
    const pick = el => { a.itens[Number(el.dataset.i)] = el.dataset.c; a.confirmado = false; save(); render(); };
    app.querySelectorAll(".cell, .foot button").forEach(el => {
      el.onclick = () => pick(el);
      el.onkeydown = e => { if (el.classList.contains("cell") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pick(el); } };
    });
    app.querySelectorAll('input[name="geral"]').forEach(el => el.onchange = () => { a.geral = el.value; a.confirmado = false; save(); upd(); });
    const upd = () => {
      const miss = a.itens.filter(x => !x).length + (a.geral ? 0 : 1);
      document.getElementById("rev").disabled = miss > 0;
      document.getElementById("miss").textContent = miss ? `${miss} resposta(s) pendente(s)` : "";
    };
    upd();
    document.getElementById("prev").onclick = () => { st.qi--; save(); render(); scrollTo(0, 0); };
    document.getElementById("rev").onclick = () => { reviewing = true; render(); scrollTo(0, 0); };
  }

  function review(q, a) {
    app.innerHTML = `<section class="panel">
      <h2>Confirme suas respostas</h2>
      <div class="box"><div class="lbl">Item e-Fisco</div><div class="txt">${esc(q.text)}</div></div>
      <table class="review"><thead><tr><th>Pergunta</th><th>Sua resposta</th></tr></thead><tbody>
        ${q.suggestions.map((s, i) => `<tr><td>Item Catmat ${i + 1}: ${esc(s.text.length > 90 ? s.text.slice(0, 90) + "…" : s.text)}</td><td><b>${LABEL[a.itens[i]]}</b></td></tr>`).join("")}
        <tr><td>Geral</td><td><b>${LABEL[a.geral]}</b></td></tr></tbody></table>
      <div class="row"><button type="button" id="back">Voltar e alterar</button><button type="button" class="primary" id="ok">Confirmar</button></div>
    </section>`;
    document.getElementById("back").onclick = () => { reviewing = false; render(); };
    document.getElementById("ok").onclick = () => {
      const mA = st.sides[q.id], mB = D.methods.find(m => m !== mA), res = c => (c === "A" ? mA : c === "B" ? mB : c);
      a.confirmado = true;
      send({ tipo: "resposta", uuid: st.uuid, query_id: q.id, metodo_A: mA,
             itens: q.suggestions.map((s, i) => ({ rank: s.rank, escolha: res(a.itens[i]) })), geral: res(a.geral) });
      reviewing = false;
      if (st.qi < D.queries.length - 1) st.qi++; else st.stage = "final";
      save(); render(); scrollTo(0, 0);
    };
  }

  function final() {
    progress.textContent = "Finalizar";
    const notOk = D.queries.map((q, i) => [q, i]).filter(([q]) => !(st.answers[q.id] && st.answers[q.id].confirmado && complete(st.answers[q.id])));
    app.innerHTML = `<section class="panel">
      <h2>Finalizar questionário</h2>
      ${notOk.length ? `<p class="warn">Ainda faltam confirmar: ${notOk.map(([, i]) => `<button type="button" data-go="${i}">item e-Fisco ${i + 1}</button>`).join(" ")}</p>`
        : `<p>Todas as respostas foram confirmadas. Depois de finalizar, não será possível alterá-las.</p>`}
      <div class="row"><button type="button" id="back">← Voltar aos itens</button><button type="button" class="primary" id="fin" ${notOk.length ? "disabled" : ""}>Finalizar e enviar</button></div>
    </section>`;
    app.querySelectorAll("[data-go]").forEach(b => b.onclick = () => { st.stage = "q"; st.qi = Number(b.dataset.go); save(); render(); });
    document.getElementById("back").onclick = () => { st.stage = "q"; st.qi = D.queries.length - 1; save(); render(); };
    document.getElementById("fin").onclick = () => { send({ tipo: "finalizar", uuid: st.uuid }); st.stage = "done"; save(); render(); };
  }

  function done() {
    progress.textContent = "";
    app.innerHTML = `<section class="panel"><h2>Obrigado pela participação!</h2>
      <p>Suas respostas foram registradas. Este questionário só pode ser respondido uma vez.</p>
      ${st.pending.length ? '<p class="warn">Ainda há respostas aguardando envio. Mantenha esta página aberta com internet até a mensagem no canto da tela sumir.</p>' : ""}</section>`;
  }

  function render() {
    ({ welcome, tutorial, q: question, final, done })[st.stage]();
    showNet();
  }

  fetch("data.json").then(r => r.json()).then(d => { D = d; render(); flush(); })
    .catch(() => { app.innerHTML = '<p class="warn">Não foi possível carregar o questionário. Recarregue a página.</p>'; });
})();
