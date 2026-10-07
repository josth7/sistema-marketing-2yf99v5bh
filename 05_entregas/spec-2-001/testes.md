# Testes — SPEC-2-001 (fase 2, correções da fase 1)

## Card b327b4ea — CA-2-01/02 (concluído 07/10)

| Etapa         | Prova                                                                                                                                | Resultado                                                        | Versão  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ------- |
| RED           | Grupo "Não informado" com CPR calculado (validação 07/10: R$ 49,54)                                                                  | reproduzido no banco real (objetivoSeguro rejeitava raw da Meta) | v0.0.35 |
| GREEN         | CPR null com motivo em desconhecido; resultados só em grupos compatíveis (objetivo+tipo+natureza); total geral sem soma incompatível | provas no agregacao.test.ts passando                             | v0.0.38 |
| GREEN         | Fixture vídeo (pago 940 + orgânico 1540) sem CPR 0,61 nem linha combinada                                                            | prova no agregacao.test.ts                                       | v0.0.38 |
| REGRESSÃO     | Ingestão Meta (21 registros) e Google (1) idempotente, raw/tipo preservados                                                          | 200 em ambas; banco 33 registros                                 | v0.0.39 |
| REGRESSÃO     | Migração 0011 remove linha orgânica vazia (RN-06)                                                                                    | banco 34→33, 0 orgânicos vazios                                  | v0.0.42 |
| Aceite humano | Josth confere o painel na produção ("agora apareceu assim")                                                                          | aprovado 07/10 17:06 (após publicar v0.0.43 na produção)         | v0.0.43 |

## Card 2b676a25 — CA-2-03/04 (07/10)

| Etapa         | Prova                                                                                                                                   | Resultado                                                    | Versão  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------- |
| RED           | Out parcial (6 dias) vs setembro incompleto (2 dias Meta, 1 Google) exibia variação% (-31,5% gasto) sem aviso                           | reproduzido: comparativo calculava % sobre janelas desiguais | v0.0.43 |
| GREEN         | Manifesto de cobertura + veredito: mês em curso → % suprimida com motivo "período em curso — totais parciais, sem variação"             | provas no agregacao.test.ts                                  | v0.0.44 |
| GREEN         | Cobertura desigual (Meta 6d vs 2d) → % suprimida com motivo "cobertura desigual — meta_ads: 6 dia(s) no período atual vs 2 no anterior" | prova no agregacao.test.ts                                   | v0.0.44 |
| GREEN         | Janelas equivalentes e fechadas → % válida (-20% no fixture)                                                                            | prova no agregacao.test.ts                                   | v0.0.44 |
| GREEN         | CPC/CPM/CTR/alcance derivados e exibíveis na tabela (colunas novas)                                                                     | cpc 0,19 · cpm 11,12 · ctr 5,81% · alcance 111.883 (fixture) | v0.0.45 |
| REGRESSÃO     | KPIs mostram o motivo da supressão em vez de % inválido; rodapé com cobertura por canal                                                 | implementado no Painel.tsx                                   | v0.0.46 |
| Aceite humano | pendente — Josth confere painel (produção publicada)                                                                                    | —                                                            | v0.0.46 |

## Observações

- Cobertura real no banco (07/10): setembro Meta 2 dias (29–30) · Google 1 dia (30) — incompleto; outubro Meta 7 dias (01–07) · Google 6 dias (01–06) — em curso. Com a regra CA-2-03, nenhum comparativo do painel real gera % até existirem janelas equivalentes e fechadas (ou backfill autorizado — fora deste card).
- A produção (sistema-marketing-1f51e.goskip.app) tem backend próprio: os totais dela divergem do preview (ex.: out/2026 com R$ 1.228,52 vs R$ 1.130,47 no preview). O comportamento (motivos, colunas, supressão) é o mesmo; a conferência de números é contra os gerenciadores nativos.
