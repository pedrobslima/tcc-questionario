# tcc-questionario

Questionário A/B, no formato "matriz completa": LEMON + correspondência (m1) x PINE do TCC, Grupo cosseno th=0.5 top3 v2 (m2).
É um site estático (`public/`) servido pela Cloudflare (Workers com static assets). As respostas vão para um banco Cloudflare D1.

## 1. Gerar os dados
Execute a partir de `~/pog/tcc`:

    python tcc-questionario/build_data.py

O script gera `public/data.json` com 20 itens e-Fisco × 3 itens Catmat e top 3 por explicação. O mapeamento m1/m2 → método fica no próprio script.

## 2. Banco (Cloudflare D1)
As respostas são gravadas pelo Worker (`src/worker.js`, rota `POST /api/enviar`) num banco D1. O esquema está em `migrations/`.
Os comandos usam o Node do nvm (`source ~/.nvm/nvm.sh`) e rodam a partir de `tcc-questionario/`:

    npx wrangler login
    npx wrangler d1 create tcc-questionario        # copie o database_id para wrangler.jsonc
    npx wrangler d1 migrations apply tcc-questionario --remote

O site só tira um envio da fila local quando o Worker responde `{ok:true}`. Se houver qualquer falha, aparece um aviso no canto da tela com o motivo.

## 3. Deploy na Cloudflare (Worker com static assets)
`wrangler.jsonc` serve `public/` como arquivos estáticos e manda `/api/*` para o Worker. `public/_headers` define `no-cache` para o `data.json`.

Pelo painel:
1. Abra **Workers & Pages → Create → Import a repository** e escolha este repositório.
2. Deixe o **Build command** vazio e use o **Deploy command** `npx wrangler deploy`.
3. Cada push na `main` dispara um deploy novo. A URL fica no formato `tcc-questionario.<subdominio>.workers.dev`.

Pela linha de comando:

    npx wrangler deploy

## Exportar os resultados

    npx wrangler d1 export tcc-questionario --remote --output respostas.sql                                  # backup completo
    npx wrangler d1 execute tcc-questionario --remote --json --command "SELECT * FROM respostas" > respostas.json

## Teste local
Este teste roda o site e o Worker com um D1 local, que fica em `.wrangler/` e está no `.gitignore`:

    npx wrangler d1 migrations apply tcc-questionario --local
    npx wrangler dev                                  # http://localhost:8787

Para recomeçar como um participante novo, apague a chave `tcc-questionario-v1` do localStorage.

## Dados gravados (tabelas do D1)
- **participantes:** uuid, secretaria, familiarizado (sim/nao), consentimento, criado_em, finalizado_em.
- **respostas:** uma linha por (uuid, item e-Fisco).
  - `metodo_A` diz qual método ficou no lado A.
  - `escolha_i` e `geral` valem `m1`, `m2`, `empate` ou `nao_sei`, já convertidos do lado A/B para o método.
  - `rank_i` é o rank original do item Catmat.
  - Se a pessoa voltar e mudar uma resposta, a mesma linha é atualizada.
  - Datas em ISO 8601 (UTC).
