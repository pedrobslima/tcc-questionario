-- Última pergunta de cada tela trocada por caixas de seleção:
-- "Quais explicações fazem você entender como o sistema chegou a estas sugestões, a ponto de confiar nelas
--  ou de perceber se o sistema errou?" (marque todas que se aplicam) + comentário opcional.
--   entendimento: m1 | m2 | ambas | nenhuma | nao_sei (A/B já convertidos para o método)
--   entendimento_comentario: texto livre, NULL se vazio
-- A coluna geral (pergunta antiga "No geral, qual explicação...") era NOT NULL; a tabela é recriada para ela
-- ficar opcional. As respostas antigas são copiadas e mantêm o valor de geral.
PRAGMA defer_foreign_keys = true;
CREATE TABLE respostas_nova (
  uuid          TEXT NOT NULL REFERENCES participantes(uuid),
  query_id      INTEGER NOT NULL,
  metodo_A      TEXT NOT NULL CHECK (metodo_A IN ('m1', 'm2')),
  rank_1        INTEGER, escolha_1 TEXT CHECK (escolha_1 IN ('m1', 'm2', 'empate', 'nao_sei')),
  rank_2        INTEGER, escolha_2 TEXT CHECK (escolha_2 IN ('m1', 'm2', 'empate', 'nao_sei')),
  rank_3        INTEGER, escolha_3 TEXT CHECK (escolha_3 IN ('m1', 'm2', 'empate', 'nao_sei')),
  ordem_m1      TEXT CHECK (ordem_m1 IN ('sim', 'parcial', 'nao', 'nao_sei')),
  ordem_m2      TEXT CHECK (ordem_m2 IN ('sim', 'parcial', 'nao', 'nao_sei')),
  entendimento  TEXT CHECK (entendimento IN ('m1', 'm2', 'ambas', 'nenhuma', 'nao_sei')),
  entendimento_comentario TEXT,
  geral         TEXT CHECK (geral IN ('m1', 'm2', 'empate', 'nao_sei')),
  atualizado_em TEXT NOT NULL,
  PRIMARY KEY (uuid, query_id)
);
INSERT INTO respostas_nova (uuid, query_id, metodo_A, rank_1, escolha_1, rank_2, escolha_2, rank_3, escolha_3,
                            ordem_m1, ordem_m2, geral, atualizado_em)
  SELECT uuid, query_id, metodo_A, rank_1, escolha_1, rank_2, escolha_2, rank_3, escolha_3,
         ordem_m1, ordem_m2, geral, atualizado_em FROM respostas;
DROP TABLE respostas;
ALTER TABLE respostas_nova RENAME TO respostas;
