# AP-2026-10-06-1715 — carga agregada (30 dias) gravada como um dia polui o painel diário

- **Task**: 462da177 (implementação) · **Data**: 2026-10-06 17:15 BRT
- **Sinal**: painel do Google em 30/09 mostrava a campanha "MOVIENARI | 00 - Inscrições YouTube" com 18.523 impressões / R$ 415,58 — janela de 30 dias gravada na data 30/09 pela carga histórica (migração 0005, `LAST_30_DAYS` sem `segments.date`). A leitura diária nova (E-12) convive com ela e a soma fica incompatível.
- **Causa**: o dedupe por (fonte+conta+campanha+dia) não distingue granularidade — um registro agregado de 30 dias e um registro diário da mesma campanha/dia são "diferentes" e coexistem.
- **Correção**: migração 0008 remove SOMENTE o registro agregado (filtro: canal=google_ads, campanha_id=24271004293, data=30/09, impressões > 10000 — guarda dupla para não apagar dado diário). API pública não pode deletar (403, escrita só pelo servidor — regra correta); exclusão teve que ser por migração.
- **Prova**: banco 8 → 7 registros Google; total 32 → 31; painel soma Out. = R$ 658,77 · 7.613 impr · 510 cliques (Google) — bate com as leituras diárias.
- **Reutilizável**: carga histórica SEM fatiamento por dia não deve gravar como se fosse um dia; se gravar, marcar (ex.: campo `granularidade`) para poder limpar quando a leitura diária cobrir o período.
