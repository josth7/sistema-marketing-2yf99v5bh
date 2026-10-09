# Testes — SPEC-2-003 (fase 2, card edd618c7 — decisões com revisão obrigatória)

## Card edd618c7 — CA-2-08 (09/10)

| Etapa         | Prova                                                                                                                             | Resultado                                                                                              | Versão  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------- |
| RED           | POST /backend/v1/decisions no código atual                                                                                        | **404** nas duas rotas (nada de decisões existia)                                                      | v0.0.52 |
| QA Skip       | pipeline completo                                                                                                                 | v0.0.53–55 falharam (correções: TS em hook JS, helpers top-level no JSVM); **v0.0.56 e v0.0.57: 100%** | v0.0.57 |
| GREEN         | Migração 0015 (coleção decisions, plain objects) + hook decisoes.js + módulo decisoes.ts + página Decisoes.tsx + rotas App/Layout | schema com 18 campos; rotas vivas                                                                      | v0.0.57 |
| Prova ao vivo | GET sem login → **401**                                                                                                           | ✓                                                                                                      | v0.0.57 |
| Prova ao vivo | POST sem review_date → **422** ("data de revisão é obrigatória") e **0 registros**                                                | ✓                                                                                                      | v0.0.57 |
| Prova ao vivo | POST com data de ontem → **422** ("deve ser de amanhã em diante")                                                                 | ✓                                                                                                      | v0.0.57 |
| Prova ao vivo | POST com data de hoje → **422** (mínimo é amanhã local America/Sao_Paulo)                                                         | ✓                                                                                                      | v0.0.57 |
| Prova ao vivo | POST completo (responsável fixture real) → **200, rev 1, state open**                                                             | ✓ (id mu1q6aicnquube1, uuid 68bd4c7b…)                                                                 | v0.0.57 |
| Prova ao vivo | PATCH sem expected_revision → **409**                                                                                             | ✓                                                                                                      | v0.0.57 |
| Prova ao vivo | PATCH com expected_revision correto → **200, rev 2** + histórico com antes/depois                                                 | ✓ (review_date 2026-10-15 → 2026-11-01)                                                                | v0.0.57 |
| Prova ao vivo | PATCH com novo review_date no passado → **422** ("novo agendamento não pode ficar no passado")                                    | ✓                                                                                                      | v0.0.57 |
| Prova ao vivo | Fechar sem resultado → **422** ("resultado da revisão é obrigatório")                                                             | ✓                                                                                                      | v0.0.57 |
| Prova ao vivo | Fechar com resultado → **200, closed** + review_outcome/closed_at gravados + histórico com antes/depois                           | ✓ ("CPR voltou ao aceitável", closed_at 2026-10-09 18:34Z)                                             | v0.0.57 |
| Prova ao vivo | PATCH em decisão encerrada → **409** ("decisão encerrada não é editável")                                                         | ✓                                                                                                      | v0.0.57 |
| Prova ao vivo | Alerta de referência fora do escopo → **403**                                                                                     | ✓ (alerta meta_ads em decisão scope google_ads)                                                        | v0.0.57 |
| Prova ao vivo | GET 2× → mesma resposta (2 itens, sem duplicar)                                                                                   | ✓                                                                                                      | v0.0.57 |
| Aceite humano | pendente — Josth confere a tela /decisoes na produção                                                                             | —                                                                                                      | v0.0.57 |

## Observações

- **BUG do JSVM corrigido (v0.0.57)**: `Intl.DateTimeFormat` NÃO existe no JSVM do PocketBase (goja) — qualquer POST com data válida chamava `amanhaISO()` e entrava em pânico (400 genérico). Correção: data local America/Sao_Paulo por aritmética UTC (UTC-3 fixo, sem horário de verão): amanhã local = data(now + 21h). Aprendizado a aplicar em QUALQUER hook que formatar datas.
- **Helpers top-level no JSVM**: declarações top-level não são visíveis dentro dos callbacks (pool de VM separado — QA integrations pega e reprova); toda a lógica inline no callback (v0.0.56).
- **TS em hook JS**: hooks são JavaScript puro — anotações de tipo quebram o format/lint (v0.0.53–55).
- **Sem lembrete/inbox nesta task**: CA-2-09 (job diário 09:30 UTC, inbox, 2 ciclos quinzenais, destaque no relatório) é do card a434ca96 — nada de notificação foi construído aqui.
- **Nenhuma decisão real criada**: as 2 decisões do banco são provas com fixture (1 encerrada, 1 aberta com revisão 2026-10-20); responsável é usuário fixture. Decisões reais entram no uso normal do sistema.
- **Responsável fixture para as provas**: ts8k8hmzmvudj0m (criterios.fixture.criador@haisan.com.br).
