-- Identificação por nome completo + data de nascimento.
-- nome: como foi digitado na primeira entrada; nome_chave: normalizado (minúsculas, sem acentos, espaços únicos),
-- usado para reconhecer o mesmo participante. nascimento: AAAA-MM-DD.
-- Participantes antigos ficam com NULL (o índice único não se aplica a eles).
ALTER TABLE participantes ADD COLUMN nome TEXT;
ALTER TABLE participantes ADD COLUMN nome_chave TEXT;
ALTER TABLE participantes ADD COLUMN nascimento TEXT;
CREATE UNIQUE INDEX participantes_identidade ON participantes (nome_chave, nascimento);
