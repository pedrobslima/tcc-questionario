-- Pergunta sobre a ordem: "as explicações do método deixam claro por que os itens Catmat podem ter sido
-- sugeridos nesta ordem?", uma resposta por método (já convertida de A/B para m1/m2).
-- Valores: sim (para todas as correspondências), parcial (nem todas), nao (para nenhuma), nao_sei (não sei responder).
-- Respostas gravadas antes desta migração ficam com NULL.
ALTER TABLE respostas ADD COLUMN ordem_m1 TEXT CHECK (ordem_m1 IN ('sim', 'parcial', 'nao', 'nao_sei'));
ALTER TABLE respostas ADD COLUMN ordem_m2 TEXT CHECK (ordem_m2 IN ('sim', 'parcial', 'nao', 'nao_sei'));
