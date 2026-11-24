// Questionário A/B: explicação m1 x m2 por item e-Fisco (query), formato "matriz completa".
// Fluxo: boas-vindas (identificação + termo + perfil) -> tutorial -> 1 tela por item e-Fisco (escolha por item
// Catmat + ordem A/B + entendimento do sistema (caixas de seleção), revisão e confirmação) -> finalizar. Estado no localStorage; envios por fila para o Worker.
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
  // Última pergunta da tela, com caixas de seleção (coluna "entendimento" no D1) + comentário opcional.
  // A e B podem ser marcadas juntas; "nenhuma" e "nao_sei" são exclusivas (desmarcam as outras).
  const Q_ENT = "Quais explicações fazem você entender como o sistema chegou a estas sugestões, a ponto de confiar nelas ou de perceber se o sistema errou?";
  const ENT = [["A", "Explicação A"], ["B", "Explicação B"], ["nenhuma", "Nenhuma das duas"], ["nao_sei", "Não sei responder"]];
  const ENT_LABEL = Object.fromEntries(ENT), ENT_EXCL = ["nenhuma", "nao_sei"];
  const entLabel = e => (e && e.length ? e.map(x => ENT_LABEL[x]).join(" e ") : "—");
  // Lista marcada (A/B/nenhuma/nao_sei) <-> valor gravado (m1/m2/ambas/nenhuma/nao_sei).
  const entToDb = (e, mA, mB) => (e.length === 2 ? "ambas" : e[0] === "A" ? mA : e[0] === "B" ? mB : e[0]);
  const entFromDb = (v, mA) => (v === "ambas" ? ["A", "B"] : v === "m1" || v === "m2" ? [v === mA ? "A" : "B"] : v ? [v] : []);
  const Q_COMENT = "Se quiser, explique sua resposta (opcional):";
  const Q_ORDEM = side => `As explicações ${side} deixam claro por que os itens Catmat podem ter sido sugeridos na ordem atual?`;
  const ORDEM = [["sim", "Sim, para todas as correspondências"], ["parcial", "Parcialmente, nem todas as correspondências"], ["nao", "Não ficou claro para nenhuma"], ["nao_sei", "Não sei responder"]];
  const ORDEM_LABEL = Object.fromEntries(ORDEM);
  const MEDAL = ["🥇", "🥈", "🥉"]; // à esquerda de "Item Catmat X", pela posição na lista de sugestões
  const app = document.getElementById("app"), progress = document.getElementById("progress"), net = document.getElementById("net");
  const tutBtn = document.getElementById("tut-btn"), tutDlg = document.getElementById("tut-dlg");
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
      <div class="txt"><b>e-Fisco:\n</b>${hl(q.text, sq, sty)}</div><div class="txt"><b>Catmat:\n</b>${hl(s.text, ss, sty)}</div>${lateral(groups, sty)}</div>`;
  }

  // ---------------- telas ----------------
  function welcome() {
    progress.textContent = "";
    app.innerHTML = `<section class="panel">
      <h2>Bem-vindo(a)</h2>
      <p>Esta pesquisa faz parte de um trabalho de conclusão de curso sobre explicações para a similaridade entre itens de compras públicas. Você vai comparar duas explicações (A e B) para itens Catmat sugeridos a partir de itens do e-Fisco.</p>
      <details class="about" open><summary>Sobre a pesquisa</summary><div class="about-body">
        <p>Para montar um mapa de preços, é preciso encontrar, em catálogos como o Catmat, itens equivalentes ao que vai ser comprado. Essa busca toma tempo, e já existem sistemas que sugerem automaticamente os itens mais parecidos. Porém, esses sistemas costumam não mostrar <b>por que</b> sugeriram cada item, e quem usa a ferramenta precisa decidir se pode confiar na sugestão.</p>
        <p>Esta pesquisa testa formas de explicar essas sugestões, destacando quais palavras dos dois itens mais pesaram na decisão do sistema. Suas respostas vão ajudar a descobrir qual forma de explicar é mais fácil de entender e mais útil para conferir se o sistema acertou. Não é um teste de conhecimento: não há respostas certas ou erradas.</p>
        <p>O projeto foi baseado no meu trabalho para o sistema <b>Mapear</b> do governo de PE, como estagiário da Secretaria Executiva de Transformação Digital.</p>
        <p class="muted">Trabalho: “Aplicação de Interpretabilidade para Correspondências entre Itens em Mapas de Preços para Compras Públicas” (Título provisório).</p>
      </div></details>
      <p>Pesquisador responsável: <b>Pedro Barros de Souza Lima</b>, estudante de graduação em Ciência da Computação no Centro de Informática (CIn) da Universidade Federal de Pernambuco (UFPE). Contato: <a href="mailto:pbsl@cin.ufpe.br">pbsl@cin.ufpe.br</a>.</p>
      <p class="muted">São ${D.queries.length} itens e-Fisco, cada um com ${D.queries[0].suggestions.length} itens Catmat. Recomenda-se usar um computador (a tela precisa de pelo menos 1000 px de largura).</p>
      <div class="box notice"><div class="lbl">Antes de começar</div><ul>
        <li>O preenchimento deve levar no máximo <b>10 minutos</b>.</li>
        <li>Seu progresso fica salvo e pode ser retomado depois, desde que você use <b>o mesmo dispositivo e o mesmo navegador</b> (por exemplo, Chrome, Safari ou Firefox). Em outro dispositivo ou navegador, não será possível continuar.</li>
        <li>Não avalie se o item Catmat sugerido é uma boa correspondência para o item e-Fisco. Avalie apenas <b>as explicações</b>: qual delas deixa mais claro por que o item foi sugerido.</li>
      </ul></div>
      <label class="field">Nome completo<input type="text" id="nome" autocomplete="name" maxlength="200"></label>
      <label class="field">Data de nascimento<input type="text" id="nasc" inputmode="numeric" autocomplete="bday" placeholder="dd/mm/aaaa" maxlength="10"></label>
      <label class="field">A qual secretaria do estado você pertence?<input type="text" id="sec" autocomplete="off" maxlength="200"></label>
      <fieldset><legend>Você está familiarizado(a) com a montagem de mapa de preços?</legend><div class="opts">
        <label><input type="radio" name="fam" value="sim"> Sim</label><label><input type="radio" name="fam" value="nao"> Não</label></div></fieldset>
      <div class="box notice"><div class="lbl">Termo de consentimento</div><p>Os dados coletados por meio deste questionário poderão ser utilizados na análise dos resultados desta pesquisa acadêmica, bem como em pesquisas futuras dela derivadas. As informações que permitam a identificação dos participantes não serão divulgadas nem compartilhadas com terceiros. Os resultados obtidos poderão ser publicados e referenciados em trabalhos acadêmicos.</p></div>
      <label class="check"><input type="checkbox" id="ok"><span>Declaro que li e concordo com os termos acima.</span></label>
      <div class="row"><button type="button" class="primary" id="go" disabled>Aceitar e começar</button><span class="warn" id="err"></span></div>
    </section>`;
    const $ = id => document.getElementById(id);
    const sec = $("sec"), nome = $("nome"), nasc = $("nasc"), ok = $("ok"), go = $("go"), err = $("err");
    const fam = () => (app.querySelector('input[name="fam"]:checked') || {}).value;
    // Data digitada como dd/mm/aaaa: só aceita números, e as barras entram sozinhas. isoNasc() = AAAA-MM-DD ou "" se inválida.
    nasc.addEventListener("input", () => {
      const d = nasc.value.replace(/\D/g, "").slice(0, 8);
      nasc.value = d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
    });
    const isoNasc = () => {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(nasc.value);
      if (!m) return "";
      const iso = `${m[3]}-${m[2]}-${m[1]}`, t = new Date(iso + "T00:00:00Z");
      return !isNaN(t) && t.toISOString().slice(0, 10) === iso && iso >= "1900-01-01" && t <= new Date() ? iso : "";
    };
    nasc.addEventListener("blur", () => { err.textContent = nasc.value && !isoNasc() ? "Data de nascimento inválida." : ""; });
    const check = () => { go.disabled = !(ok.checked && sec.value.trim() && nome.value.trim().length >= 3 && isoNasc() && fam()); };
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
          body: JSON.stringify({ uuid: novo, nome: nome.value.trim(), nascimento: isoNasc(), secretaria: sec.value.trim(),
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
    const mB = D.methods.find(m => m !== r.metodo_A);
    return { itens, entend: entFromDb(r.entendimento, r.metodo_A), comentario: r.entendimento_comentario || "", ordem: { A: r[`ordem_${r.metodo_A}`], B: r[`ordem_${mB}`] }, confirmado: true };
  }

  // ---------------- tutorial (tela inicial e pop-up do cabeçalho) ----------------
  // Diagramas com um exemplo ilustrativo (não é um item do questionário), montados com os mesmos estilos das telas.
  function diagrams() {
    const c = i => D.colors[i % D.colors.length];
    const m = (i, a, t) => `<mark style="background:${rgba(c(i), a)};${a >= 0.5 ? "color:#000" : ""}">${esc(t)}</mark>`;
    const n = k => `<span class="badge">${k}</span>`;
    const line = (i, a, sug, v, qry) => `<div class="ln">${m(i, a, sug)} <span class="ar">←</span> <span class="v">(${v})</span> <span class="ar">−</span> ${m(i, a, qry)}</div>`;
    const fake = sel => `<div class="cell demo-cell"${sel ? ' aria-pressed="true"' : ""}><div class="ph"></div><div class="ph short"></div><div class="ph"></div></div>`;
    const d1 = `<figure class="diagram"><figcaption>Diagrama 1: como ler uma explicação</figcaption>
      <div class="demo-grid">
        <div class="cell demo-cell">
          <div class="txt"><b>e-Fisco</b>${m(0, 1, "CANETA ESFEROGRÁFICA")}, TINTA ${m(1, .55, "AZUL")}, PONTA ${m(2, .2, "MÉDIA")} 1.0 MM ${n(1)}</div>
          <div class="txt"><b>Catmat</b>${m(0, 1, "CANETA ESFEROGRÁFICA")}, MATERIAL: PLÁSTICO, COR TINTA: ${m(1, .55, "AZUL")}, ESCRITA: ${m(2, .2, "FINA")} ${n(2)}</div>
          <div class="lat">${line(0, 1, "CANETA ESFEROGRÁFICA", "+18,2", "CANETA ESFEROGRÁFICA")}${line(1, .55, "AZUL", "+6,5", "AZUL")}${line(2, .2, "FINA", "−1,3", "MÉDIA")} ${n(3)}</div>
        </div>
        <ol class="legend">
          <li>Termos com a <b>mesma cor</b> no item e-Fisco e no item Catmat estão relacionados.</li>
          <li>Quanto <b>mais forte a cor</b>, maior a influência do termo na similaridade.</li>
          <li>Cada linha resume uma relação: o número entre parênteses é o quanto ela <b>aumenta (+)</b> ou <b>diminui (−)</b> a pontuação de similaridade.</li>
        </ol>
      </div></figure>`;
    const d2 = `<figure class="diagram"><figcaption>Diagrama 2: como escolher em cada item Catmat</figcaption>
      <div class="demo-grid">
        <div class="demo-matrix">
          <div></div><div class="colhead"><span class="medal" aria-hidden="true">${MEDAL[0]}</span>Item Catmat 1</div><div class="colhead"><span class="medal" aria-hidden="true">${MEDAL[1]}</span>Item Catmat 2</div>
          <div class="rowlabel">A</div>${fake(true)}${fake(false)}
          <div class="rowlabel">B</div>${fake(false)}${fake(false)}
          <div></div><div class="foot"><button type="button" tabindex="-1">Empate</button><button type="button" tabindex="-1">Não sei responder</button></div>
          <div class="foot"><button type="button" tabindex="-1" aria-pressed="true">Empate</button><button type="button" tabindex="-1">Não sei responder</button> ${n(2)}</div>
        </div>
        <ol class="legend">
          <li>No item Catmat 1, a pessoa <b>clicou na explicação A</b>, que ficou marcada com “✓”.</li>
          <li>No item Catmat 2, as duas explicações pareceram equivalentes, então ela usou <b>Empate</b>. Se não conseguir avaliar, use <b>Não sei responder</b>.</li>
        </ol>
      </div></figure>`;
    const steps = ["Escolher A, B, Empate ou Não sei em cada item Catmat", "Responder sobre a ordem dos itens (explicações A e B)", "Marcar quais explicações ajudam a entender o sistema", "Revisar e confirmar"];
    const d3 = `<figure class="diagram"><figcaption>Diagrama 3: o que fazer em cada tela</figcaption>
      <div class="flow">${steps.map((t, i) => `<div class="step"><span class="badge">${i + 1}</span>${esc(t)}</div>`).join('<div class="arrow" aria-hidden="true">→</div>')}
        <div class="arrow" aria-hidden="true">→</div><div class="step muted">Próximo item e-Fisco</div></div></figure>`;
    return d1 + d2 + d3;
  }
  function tutorialBody() {
    return `<ol>
        <li>Cada tela mostra <b>um item e-Fisco</b> e os <b>itens Catmat</b> sugeridos para ele, em colunas, da maior para a menor similaridade (pontuação de 0 a 100).</li>
        <li>Para cada item Catmat há duas explicações, nas linhas <b>A</b> e <b>B</b>. Elas destacam os termos que mais influenciaram a similaridade.</li>
        <li>Termos com a <b>mesma cor</b> no item e-Fisco e no item Catmat estão relacionados entre si. Quanto mais forte a cor, maior a influência.</li>
        <li>Abaixo dos textos, cada linha resume uma relação: <span class="fmt">termo Catmat ← (+X) − termo e-Fisco</span>. X é o quanto essa relação aumenta (+) ou diminui (−) a pontuação de similaridade. Uma linha com um lado só indica um termo que influenciou sozinho.</li>
        <li>Em cada coluna, <b>clique na explicação (A ou B)</b> que deixa mais claro por que aquele item Catmat é similar ao item e-Fisco. Se as duas forem equivalentes, use <b>Empate</b>; se não conseguir avaliar, use <b>Não sei responder</b>.</li>
        <li>Depois, diga se as explicações A e as explicações B deixam claro por que os itens Catmat podem ter sido sugeridos na ordem em que aparecem, e marque quais explicações fazem você entender como o sistema chegou às sugestões, a ponto de confiar nelas ou de perceber se ele errou (pode marcar as duas). Há um campo opcional para explicar sua resposta.</li>
        <li>Ao final de cada tela, você verá um resumo das suas respostas para confirmar. Você pode voltar a itens anteriores e mudar respostas até finalizar o questionário.</li>
      </ol>
      ${diagrams()}
      <p class="muted">Os diagramas usam um exemplo ilustrativo. As posições A e B mudam de um item e-Fisco para outro; não há uma resposta certa.</p>`;
  }
  function tutorial() {
    progress.textContent = "Tutorial";
    app.innerHTML = `<section class="panel"><h2>Como responder</h2>${tutorialBody()}
      <div class="row"><button type="button" class="primary" id="go">Começar</button></div></section>`;
    document.getElementById("go").onclick = () => { st.stage = "q"; st.qi = 0; save(); render(); };
  }
  function openTutorial() {
    tutDlg.innerHTML = `<div class="dlg-head"><h2>Como responder</h2><button type="button" id="tut-close" aria-label="Fechar tutorial">Fechar ✕</button></div>${tutorialBody()}`;
    document.getElementById("tut-close").onclick = () => tutDlg.close();
    tutDlg.showModal();
    tutDlg.scrollTop = 0;
  }
  tutBtn.onclick = () => { if (D) openTutorial(); };
  tutDlg.addEventListener("click", e => { if (e.target === tutDlg) tutDlg.close(); }); // clique fora fecha

  const ans = q => {
    const a = (st.answers[q.id] = st.answers[q.id] || { itens: q.suggestions.map(() => null), confirmado: false });
    a.entend = a.entend || []; // respostas locais anteriores às caixas de seleção
    a.ordem = a.ordem || { A: null, B: null }; // respostas locais anteriores à pergunta sobre a ordem
    return a;
  };
  const complete = a => a.itens.every(Boolean) && a.entend && a.entend.length && a.ordem && a.ordem.A && a.ordem.B;

  function question() {
    const q = D.queries[st.qi], a = ans(q), mA = st.sides[q.id], mB = D.methods.find(m => m !== mA);
    progress.textContent = `Item e-Fisco ${st.qi + 1} de ${D.queries.length}`;
    if (reviewing) return review(q, a);
    let h = `<div class="box"><div class="lbl">Item e-Fisco</div><div class="txt">${esc(q.text)}</div></div>
      <p><b>${esc(Q_ITEM)}</b> <span class="muted">Clique na célula da explicação escolhida, ou use os botões abaixo de cada coluna.</span></p>
      <p class="narrow">Sua tela é estreita: role para o lado para ver todos os itens Catmat.</p>
      ${matrix(q, a, mA, mB, false)}
      ${["A", "B"].map(side => `<fieldset><legend>${esc(Q_ORDEM(side))}</legend><div class="opts">${ORDEM.map(([c, l]) =>
        `<label><input type="radio" name="ordem_${side}" value="${c}" ${a.ordem[side] === c ? "checked" : ""}> ${l}</label>`).join("")}</div></fieldset>`).join("")}
      <fieldset><legend>${esc(Q_ENT)} <span class="muted">Marque todas que se aplicam.</span></legend><div class="opts">${ENT.map(([c, l]) =>
        `<label><input type="checkbox" name="entend" value="${c}" ${a.entend.includes(c) ? "checked" : ""}> ${l}</label>`).join("")}</div>
        <label class="field coment">${esc(Q_COMENT)}<textarea id="coment" rows="3" maxlength="2000">${esc(a.comentario || "")}</textarea></label></fieldset>
      <div class="row end"><button type="button" id="prev" ${st.qi === 0 ? "disabled" : ""}>← Item e-Fisco anterior</button>
        <span class="row"><span class="muted" id="miss"></span><button type="button" class="primary" id="rev">Revisar respostas</button></span></div>`;
    app.innerHTML = h;
    const pick = el => { a.itens[Number(el.dataset.i)] = el.dataset.c; a.confirmado = false; save(); render(); };
    app.querySelectorAll(".cell, .foot button").forEach(el => {
      el.onclick = () => pick(el);
      el.onkeydown = e => { if (el.classList.contains("cell") && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); pick(el); } };
    });
    const ents = [...app.querySelectorAll('input[name="entend"]')];
    ents.forEach(el => el.onchange = () => {
      if (el.checked) ents.forEach(o => { if (o !== el && (ENT_EXCL.includes(el.value) || ENT_EXCL.includes(o.value))) o.checked = false; });
      a.entend = ents.filter(o => o.checked).map(o => o.value); a.confirmado = false; save(); upd();
    });
    document.getElementById("coment").oninput = e => { a.comentario = e.target.value; a.confirmado = false; save(); };
    for (const side of ["A", "B"])
      app.querySelectorAll(`input[name="ordem_${side}"]`).forEach(el => el.onchange = () => { a.ordem[side] = el.value; a.confirmado = false; save(); upd(); });
    const upd = () => {
      const miss = a.itens.filter(x => !x).length + (a.entend.length ? 0 : 1) + (a.ordem.A ? 0 : 1) + (a.ordem.B ? 0 : 1);
      document.getElementById("rev").disabled = miss > 0;
      document.getElementById("miss").textContent = miss ? `${miss} resposta(s) pendente(s)` : "";
    };
    upd();
    document.getElementById("prev").onclick = () => { st.qi--; save(); render(); scrollTo(0, 0); };
    document.getElementById("rev").onclick = () => { reviewing = true; render(); scrollTo(0, 0); };
  }

  // Matriz 2 (A/B) x itens Catmat. ro = só leitura (página /answers).
  function matrix(q, a, mA, mB, ro) {
    let h = `<div class="scroll"><div class="matrix${ro ? " ro" : ""}"><div class="vrule r1" aria-hidden="true"></div><div class="vrule r2" aria-hidden="true"></div><div></div>`;
    h += q.suggestions.map((s, i) => `<div class="colhead"><span class="medal" aria-hidden="true">${MEDAL[i] || ""}</span>Item Catmat ${i + 1} <span>· Similaridade: ${num1(s.score)}</span></div>`).join("");
    for (const [side, m] of [["A", mA], ["B", mB]]) {
      h += `<div class="rowlabel">Método ${side}</div>`;
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
        <tr><td>Ordem: explicações A</td><td><b>${ORDEM_LABEL[a.ordem.A]}</b></td></tr>
        <tr><td>Ordem: explicações B</td><td><b>${ORDEM_LABEL[a.ordem.B]}</b></td></tr>
        <tr><td>Entendimento do sistema</td><td><b>${entLabel(a.entend)}</b></td></tr>
        <tr><td>Comentário</td><td class="coment-txt">${a.comentario && a.comentario.trim() ? esc(a.comentario.trim()) : '<span class="muted">(sem comentário)</span>'}</td></tr></tbody></table>
      <div class="row"><button type="button" id="back">Voltar e alterar</button><button type="button" class="primary" id="ok">Confirmar</button></div>
    </section>`;
    document.getElementById("back").onclick = () => { reviewing = false; render(); };
    document.getElementById("ok").onclick = () => {
      const mA = st.sides[q.id], mB = D.methods.find(m => m !== mA), res = c => (c === "A" ? mA : c === "B" ? mB : c);
      a.confirmado = true;
      send({ tipo: "resposta", uuid: st.uuid, query_id: q.id, metodo_A: mA,
             itens: q.suggestions.map((s, i) => ({ rank: s.rank, escolha: res(a.itens[i]) })), entendimento: entToDb(a.entend, mA, mB), entendimento_comentario: (a.comentario || "").trim(),
             ordem_m1: a.ordem[toSide("m1", mA)], ordem_m2: a.ordem[toSide("m2", mA)] });
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
    tutBtn.hidden = st.stage === "welcome" || st.stage === "tutorial";
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
      h += matrix(q, a, r.metodo_A, mB, true)
        + ["A", "B"].map(side => `<p><b>${esc(Q_ORDEM(side))}</b> ${esc(ORDEM_LABEL[a.ordem[side]] || "—")}</p>`).join("")
        + `<p><b>${esc(Q_ENT)}</b> ${esc(entLabel(a.entend))}</p>`
        + (a.comentario ? `<p><b>Comentário:</b> <span class="coment-txt">${esc(a.comentario)}</span></p>` : "") + `</section>`;
    });
    app.innerHTML = h;
  }

  fetch("/data.json").then(r => r.json()).then(d => {
    D = d;
    if (ANSWERS) { tutBtn.hidden = false; answersPage(); flush(); return; }
    // Já finalizou e não há envio pendente: vai direto para a revisão.
    if (st.stage === "done" && !st.pending.length) { location.replace("/answers"); return; }
    render(); flush();
  })
    .catch(() => { app.innerHTML = '<p class="warn">Não foi possível carregar o questionário. Recarregue a página.</p>'; });
})();
