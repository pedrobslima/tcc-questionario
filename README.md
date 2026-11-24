# tcc-questionario

Questionário A/B, no formato "matriz completa": LEMON + correspondência (m1) x PINE do TCC, Grupo cosseno th=0.5 top3 v2 (m2).
É um site estático (`public/`) servido pela Cloudflare (Workers com static assets). As respostas vão para uma planilha Google via Apps Script.

## 1. Gerar os dados
Execute a partir de `~/pog/tcc`:

    python tcc-questionario/build_data.py

O script gera `public/data.json` com 20 itens e-Fisco × 3 itens Catmat e top 3 por explicação. O mapeamento m1/m2 → método fica no próprio script.

## 2. Planilha + Apps Script
1. Crie uma planilha no Google Sheets e abra **Extensões → Apps Script**.
2. Cole o conteúdo de `apps-script/Code.gs` e salve.
3. Vá em **Implantar → Nova implantação → Tipo: App da Web**. Use **Executar como: eu** e **Quem pode acessar: qualquer pessoa**.
4. Copie a URL (`https://script.google.com/macros/s/.../exec`) para `public/config.js` (`endpoint`).
5. Se mudar o `Code.gs`, faça uma nova versão em **Gerenciar implantações** para manter a mesma URL.

As abas `participantes` e `respostas` são criadas no primeiro envio.

## 3. Deploy na Cloudflare (Workers com static assets)
A configuração fica em `wrangler.jsonc`: um Worker sem código que serve `public/`. O `public/_headers` define `no-cache` para o `data.json`.

Pelo painel:
1. Abra **Workers & Pages → Create → Import a repository** e escolha este repositório.
2. Deixe o **Build command** vazio e use o **Deploy command** `npx wrangler deploy`.
3. Cada push na `main` dispara um deploy novo. A URL fica no formato `tcc-questionario.<subdominio>.workers.dev`.

Pela linha de comando (requer Node):

    npx wrangler login
    npx wrangler deploy

## Teste local

    python -m http.server -d tcc-questionario/public 8000

Para recomeçar como um participante novo, apague a chave `tcc-questionario-v1` do localStorage.

## Dados gravados
- **participantes:** uuid, secretaria, familiarizado (sim/nao), consentimento, criado_em, finalizado_em.
- **respostas:** uma linha por (uuid, item e-Fisco).
  - `metodo_A` diz qual método ficou no lado A.
  - `escolha_i` e `geral` valem `m1`, `m2`, `empate` ou `nao_sei`, já convertidos do lado A/B para o método.
  - `rank_i` é o rank original do item Catmat.
  - Se a pessoa voltar e mudar uma resposta, a mesma linha é atualizada.
