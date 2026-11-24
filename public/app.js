// Questionário A/B: explicação m1 x m2 por item e-Fisco (query), formato "matriz completa".
// Fluxo: boas-vindas (identificação + termo + perfil) -> tutorial -> 1 tela por item e-Fisco (escolha por item
// Catmat + geral, revisão e confirmação) -> finalizar. Estado no localStorage; envios por fila para o Worker.
// Em /answers (public/answers.html) o mesmo script mostra, só para leitura, as respostas gravadas no servidor.
(function () {
  "use strict";
  const KEY = "tcc-questionario-v1";
  const API = (window.QUESTIONARIO_CONFIG || {}).api || "";
  const ENDPOINT = API && API + "/enviar";
  const ANSWERS = location.pathname.replace(/\/+$/, "").endsWith("/answers");
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
    if (D && !ANSWERS && st.stage === "done") render(); else showNet(); // tela final mostra o link quando a fila esvazia
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
  function cell(q, s, m, side, i, chosen, ro) {
    const groups = s.by[m], sty = styles(groups), sq = [], ss = [];
    for (const g of groups) {
      if (g.q) for (const [a, b] of g.q.sp) sq.push([a, b, g.o]);
      for (const t of g.s) for (const [a, b] of t.sp) ss.push([a, b, g.o]);
    }
    const attrs = ro ? `aria-label="Explicação ${side} do item Catmat ${i + 1}${chosen ? " (escolhida)" : ""}"`
      : `role="button" tabindex="0" aria-label="Escolher explicação ${side} para o item Catmat ${i + 1}"`;
    return `<div class="cell" ${attrs} aria-pressed="${chosen}" data-i="${i}" data-c="${side}">
      <div class="txt"><b>e-Fisco</b>${hl(q.text, sq, sty)}</div><div class="txt"><b>Catmat</b>${hl(s.text, ss, sty)}</div>${lateral(groups, sty)}</div>`;
  }

  // ---------------- telas ----------------
  function welcome() {
    progress.textContent = "";
    app.innerHTML = `<section class="panel">
      <h2>Bem-vindo(a)</h2>
      <p>Esta pesquisa faz parte de um trabalho de conclusão de curso sobre explicações para a similaridade entre itens de compras públicas. Você vai comparar duas explicações (A e B) para itens Catmat sugeridos a partir de itens do e-Fisco.</p>
      <p class="muted">São ${D.queries.length} itens e-Fisco, cada um com ${D.queries[0].suggestions.length} itens Catmat. Recomendamos usar um computador (a tela precisa de pelo menos 1000 px de largura).</p>
      <div class="box"><div class="lbl">Antes de começar</div><ul>
        <li>O preenchimento deve levar no máximo <b>10 minutos</b>.</li>
        <li>Seu progresso fica salvo e pode ser retomado depois, desde que você use <b>o mesmo dispositivo e o mesmo navegador</b> (por exemplo, Chrome, Safari ou Firefox). Em outro dispositivo ou navegador, não será possível continuar.</li>
        <li>Não avalie se o item Catmat sugerido é uma boa correspondência para o item e-Fisco. Avalie apenas <b>as explicações</b>: qual delas deixa mais claro por que o item foi sugerido.</li>
      </ul></div>
      <label class="field">Nome completo<input type="text" id="nome" autocomplete="name" maxlength="200"></label>
      <label class="field">Data de nascimento<input type="date" id="nasc" min="1900-01-01" max="${new Date().toISOString().slice(0, 10)}"></label>
      <label class="field">A qual secretaria do estado você pertence?<input type="text" id="sec" autocomplete="off" maxlength="200"></label>
      <fieldset><legend>Você está familiarizado(a) com a montagem de mapa de preços?</legend><div class="opts">
        <label><input type="radio" name="fam" value="sim"> Sim</label><label><input type="radio" name="fam" value="nao"> Não</label></div></fieldset>
      <div class="box"><div class="lbl">Termo de consentimento</div><p>Os dados coletados por meio deste questionário poderão ser utilizados na análise dos resultados desta pesquisa acadêmica, bem como em pesquisas futuras dela derivadas. As informações que permitam a identificação dos participantes não serão divulgadas nem compartilhadas com terceiros. Os resultados obtidos poderão ser publicados e referenciados em trabalhos acadêmicos.</p></div>
      <label class="check"><input type="checkbox" id="ok"><span>Declaro que li e concordo com os termos acima.</span></label>
      <div class="row"><button type="button" class="primary" id="go" disabled>Aceitar e começar</button><span class="warn" id="err"></span></div>
    </section>`;
    const $ = id => document.getElementById(id);
    const sec = $("sec"), nome = $("nome"), nasc = $("nasc"), ok = $("ok"), go = $("go"), err = $("err");
    const fam = () => (app.querySelector('input[name="fam"]:checked') || {}).value;
    const check = () => { go.disabled = !(ok.checked && sec.value.trim() && nome.value.trim().length >= 3 && nasc.value && fam()); };
    app.querySelectorAll("input").forEach(el => el.addEventListener("input", check));
    app.querySelectorAll("input").forEach(el => el.addEventListener("change", check));
    go.onclick = async () => {
      go.disabled = true; err.textContent = "";
      // O uuid é guardado antes do envio: se a resposta se perder e a pessoa clicar de novo, o mesmo uuid é reenviado.
      st.novoUuid = st.novoUuid || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
      save();
      const novo = st.novoUuid;
      let body = null;
      try {
        const res = await fetch(API + "/entrar", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uuid: novo, nome: nome.value.trim(), nascimento: nasc.value, secretaria: sec.value.trim(),
                                 familiarizado: fam(), consentimento: true }) });
        try { body = await res.json(); } catch (e) {}
        if (body && body.erro === "067") { app.innerHTML = '<p class="warn">[067] Erro ao carregar o questionário</p>'; return; }
        if (!(res.ok && body && body.ok)) throw new Error(`servidor recusou (${res.status}${body && body.erro ? ": " + body.erro : ""})`);
        st.uuid = body.uuid;
        delete st.novoUuid;
        if (body.finalizado) { st.stage = "done"; save(); location.assign("/answers"); return; }
        sortSides(); st.stage = "tutorial";
      } catch (e) {
        err.textContent = `Não foi possível entrar: ${e.message === "Failed to fetch" ? "sem conexão com o servidor" : e.message}`;
        check(); return;
      }
      save(); render();
    };
  }

  // Lado A/B por item e-Fisco: o método mostrado como A. Só sorteia itens que ainda não têm lado.
  function sortSides() { for (const q of D.queries) if (!st.sides[q.id]) st.sides[q.id] = Math.random() < 0.5 ? D.methods[0] : D.methods[1]; }
  const toSide = (m, mA) => (m === mA ? "A" : D.methods.includes(m) ? "B" : m);
  async function fetchAnswers() {
    const res = await fetch(`${API}/respostas?uuid=${encodeURIComponent(st.uuid)}`);
    let body = null; try { body = await res.json(); } catch (e) {}
    if (!(res.ok && body && body.ok)) throw new Error(`servidor recusou (${res.status}${body && body.erro ? ": " + body.erro : ""})`);
    return body;
  }
  // Converte uma linha da tabela respostas para o formato local (A/B na ordem das sugestões).
  function rowToAnswer(q, r) {
    const itens = q.suggestions.map(() => null);
    for (const k of [1, 2, 3]) {
      const i = q.suggestions.findIndex(s => s.rank === r[`rank_${k}`]);
      if (i >= 0) itens[i] = toSide(r[`escolha_${k}`], r.metodo_A);
    }
    return { itens, geral: toSide(r.geral, r.metodo_A), confirmado: true };
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
      ${matrix(q, a, mA, mB, false)}
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

  // Matriz 2 (A/B) x itens Catmat. ro = só leitura (página /answers).
  function matrix(q, a, mA, mB, ro) {
    let h = `<div class="scroll"><div class="matrix${ro ? " ro" : ""}"><div></div>`;
    h += q.suggestions.map((s, i) => `<div class="colhead">Item Catmat ${i + 1} <span>· score ${num1(s.score)}</span></div>`).join("");
    for (const [side, m] of [["A", mA], ["B", mB]]) {
      h += `<div class="rowlabel">Explicação ${side}</div>`;
      h += q.suggestions.map((s, i) => cell(q, s, m, side, i, a.itens[i] === side, ro)).join("");
    }
    h += `<div></div>` + q.suggestions.map((s, i) => `<div class="foot">${CHOICES.slice(2).map(([c, l]) =>
      `<button type="button" data-i="${i}" data-c="${c}" aria-pressed="${a.itens[i] === c}" ${ro ? "disabled" : ""}>${l}</button>`).join("")}</div>`).join("");
    return h + `</div></div>`;
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
      ${st.pending.length ? '<p class="warn">Ainda há respostas aguardando envio. Mantenha esta página aberta com internet até a mensagem no canto da tela sumir.</p>'
        : '<div class="row"><a class="btn" href="/answers">Rever minhas respostas</a></div>'}</section>`;
  }

  function render() {
    ({ welcome, tutorial, q: question, final, done })[st.stage]();
    showNet();
  }

  // ---------------- /answers: respostas gravadas no servidor, só leitura ----------------
  async function answersPage() {
    progress.textContent = "Suas respostas";
    if (!st.uuid) {
      app.innerHTML = `<section class="panel"><p>Nenhum participante identificado neste navegador.</p><div class="row"><a class="btn" href="/">Ir para o questionário</a></div></section>`;
      return;
    }
    let body;
    try { body = await fetchAnswers(); }
    catch (e) { app.innerHTML = `<p class="warn">Não foi possível carregar suas respostas (${esc(e.message === "Failed to fetch" ? "sem conexão com o servidor" : e.message)}). Recarregue a página.</p>`; return; }
    if (!body.finalizado) { location.replace("/"); return; }
    const rows = new Map(body.respostas.map(r => [r.query_id, r]));
    let h = `<section class="panel"><h2>Suas respostas</h2><p>O questionário já foi finalizado. Estas são as respostas registradas; elas não podem mais ser alteradas.</p></section>`;
    D.queries.forEach((q, n) => {
      const r = rows.get(q.id);
      h += `<section class="answer"><h3>Item e-Fisco ${n + 1} de ${D.queries.length}</h3>
        <div class="box"><div class="lbl">Item e-Fisco</div><div class="txt">${esc(q.text)}</div></div>`;
      if (!r) { h += `<p class="warn">Sem resposta registrada.</p></section>`; return; }
      const a = rowToAnswer(q, r), mB = D.methods.find(m => m !== r.metodo_A);
      h += matrix(q, a, r.metodo_A, mB, true) + `<p><b>${esc(Q_GERAL)}</b> ${esc(LABEL[a.geral] || "—")}</p></section>`;
    });
    app.innerHTML = h;
  }

  fetch("/data.json").then(r => r.json()).then(d => {
    D = d;
    if (ANSWERS) { answersPage(); flush(); return; }
    // Já finalizou e não há envio pendente: vai direto para a revisão.
    if (st.stage === "done" && !st.pending.length) { location.replace("/answers"); return; }
    render(); flush();
  })
    .catch(() => { app.innerHTML = '<p class="warn">Não foi possível carregar o questionário. Recarregue a página.</p>'; });
})();
