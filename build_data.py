"""Gera public/data.json para o questionário: LEMON + correspondência x PINE do TCC (Grupo cosseno th=0.5, top3 v2).
Uso (de ~/pog/tcc):  python tcc-questionario/build_data.py

- Queries (itens e-Fisco) da amostra do le20, em ordem de query_id (a mesma ordem para todos os participantes).
- Sugestões (itens Catmat) em ordem decrescente de score original.
- Top 3 pares/grupos de cada método (ordem salva); o LEMON + correspondência é cortado aqui, o PINE já tem top3.
- Nenhum nome de método vai para a página: só as chaves "m1"/"m2"; o mapeamento fica em METHODS abaixo e na planilha.
"""
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
AMOSTRA_CSV = ROOT / "data/3_post_predictions_media_sug_le20_amostra.csv"
TOP = 3
# chave anônima -> (arquivo, nome do método na análise)
METHODS = {
    "m1": (ROOT / "resultados/le20_amostra_baselines/lemon_match_one_to_one_k5_th05.json", "lemon_match"),
    "m2": (ROOT / "resultados/le20_amostra_tcc/grupo_cosseno_sim_th05_top3_v2.json", "pine_grupo_v2"),
}
COLORS = ["#9ecae1", "#fdae6b", "#a1d99b", "#f4a6c8", "#bcbddc", "#ffe066", "#7fd6cc", "#fc9272", "#d9b38c", "#c7e9c0"]
OUT = Path(__file__).resolve().parent / "public/data.json"


def slim(g):
    return {
        "o": g["order"], "v": round(g["score"], 2),
        "q": {"t": g["token_query"]["text"], "sp": g["token_query"]["spans"]} if g["token_query"] else None,
        "s": [{"t": t["text"], "sp": t["spans"]} for t in g["tokens_suggestions"]],
    }


if __name__ == "__main__":
    qids = sorted(set(int(x) for x in pd.read_csv(AMOSTRA_CSV, sep="|")["idx_pred"] // 3))
    exps = {k: {q["query_id"]: q for q in json.load(open(p))["queries"]} for k, (p, _) in METHODS.items()}
    queries = []
    for qid in qids:
        ref = exps["m1"][qid]
        sugs = []
        for s in sorted(ref["suggestions"], key=lambda s: -s["original_score"]):
            by = {}
            for k in METHODS:
                q = exps[k][qid]
                assert q["text"] == ref["text"], (k, qid)
                s2 = next(x for x in q["suggestions"] if x["rank"] == s["rank"])
                assert s2["text"] == s["text"], (k, qid, s["rank"])
                by[k] = [slim(g) for g in sorted(s2["groups"], key=lambda g: g["order"])[:TOP]]
            sugs.append({"rank": s["rank"], "text": s["text"], "score": round(s["original_score"], 2), "by": by})
        queries.append({"id": qid, "text": ref["text"], "suggestions": sugs})
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"colors": COLORS, "methods": list(METHODS), "queries": queries}, ensure_ascii=False,
                              separators=(",", ":")), encoding="utf-8")
    print(OUT, f"{OUT.stat().st_size / 1e3:.0f} kB, {len(queries)} queries")
    print("mapeamento:", {k: v[1] for k, v in METHODS.items()})
