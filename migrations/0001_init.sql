-- Esquema do questionário. Uma linha por participante e uma por (participante, item e-Fisco).
CREATE TABLE participantes (
  uuid          TEXT PRIMARY KEY,
  secretaria    TEXT NOT NULL,
  familiarizado TEXT NOT NULL CHECK (familiarizado IN ('sim', 'nao')),
  consentimento INTEGER NOT NULL CHECK (consentimento = 1),
  criado_em     TEXT NOT NULL,
  finalizado_em TEXT
);

CREATE TABLE respostas (
  uuid          TEXT NOT NULL REFERENCES participantes(uuid),
  query_id      INTEGER NOT NULL,
  metodo_A      TEXT NOT NULL CHECK (metodo_A IN ('m1', 'm2')),
  rank_1        INTEGER, escolha_1 TEXT CHECK (escolha_1 IN ('m1', 'm2', 'empate', 'nao_sei')),
  rank_2        INTEGER, escolha_2 TEXT CHECK (escolha_2 IN ('m1', 'm2', 'empate', 'nao_sei')),
  rank_3        INTEGER, escolha_3 TEXT CHECK (escolha_3 IN ('m1', 'm2', 'empate', 'nao_sei')),
  geral         TEXT NOT NULL CHECK (geral IN ('m1', 'm2', 'empate', 'nao_sei')),
  atualizado_em TEXT NOT NULL,
  PRIMARY KEY (uuid, query_id)
);
