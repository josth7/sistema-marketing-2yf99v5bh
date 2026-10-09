# Testes — SPEC-2-003 (fase 2, card edd618c7 — decisões com revisão obrigatória)

## Card edd618c7 — CA-2-08 (09/10)

| Etapa                       | Prova                                                                                                                                                                | Resultado                                                                          | Versão  |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------- |
| RED                         | POST /backend/v1/decisions no código atual                                                                                                                           | **404** nas duas rotas (nada de decisões existia)                                  | v0.0.52 |
| QA Skip                     | pipeline completo                                                                                                                                                    | v0.0.53–55 (correções: TS em hook JS, helpers top-level JSVM); v0.0.56–57 **100%** | v0.0.57 |
| GREEN                       | Migração 0015 (coleção decisions, plain objects, 18 campos) + hook decisoes.js (GET/POST/PATCH/close) + módulo decisoes.ts + página Decisoes.tsx + rotas App/Layout  | rotas vivas                                                                        | v0.0.57 |
| Prova ao vivo               | GET sem login → **401**                                                                                                                                              | ✓                                                                                  | v0.0.57 |
| Prova ao vivo               | POST sem review_date / data ontem / data hoje → **422** (não persiste)                                                                                               | ✓                                                                                  | v0.0.57 |
| Prova ao vivo               | POST completo (responsável ID fixture) → **200, rev 1, open**                                                                                                        | ✓                                                                                  | v0.0.57 |
| Prova ao vivo               | PATCH sem expected_revision → **409**; com revision → **200 rev 2** + histórico antes/depois                                                                         | ✓                                                                                  | v0.0.57 |
| Prova ao vivo               | PATCH com novo agendamento passado → **422**                                                                                                                         | ✓                                                                                  | v0.0.57 |
| Prova ao vivo               | Fechar sem resultado → **422**; com resultado → **200 closed** + outcome/closed_at + histórico                                                                       | ✓                                                                                  | v0.0.57 |
| Prova ao vivo               | PATCH em encerrada → **409**                                                                                                                                         | ✓                                                                                  | v0.0.57 |
| Prova ao vivo               | Alerta fora do escopo → **403**                                                                                                                                      | ✓                                                                                  | v0.0.57 |
| Prova ao vivo               | GET 2× idempotente                                                                                                                                                   | ✓                                                                                  | v0.0.57 |
| DEBUG (teste humano falhou) | **Responsável por e-mail era rejeitado** (limite 30 chars + busca só por ID) e **erros do servidor não apareciam na tela** (formato incompatível) → falha silenciosa | reproduzido no navegador                                                           | v0.0.59 |
| Correção                    | hook aceita **ID ou E-MAIL** (limite 200, mensagem ensina); página exibe `erro` + erros por campo                                                                    | QA 100% v0.0.59–61                                                                 | v0.0.61 |
| Revalidação ao vivo         | decisão com responsável por **e-mail** salva **200** (id if3huocsb7t191p) e lista recarrega                                                                          | ✓                                                                                  | v0.0.61 |
| Aceite humano               | pendente — Josth confere /decisoes na produção                                                                                                                       | —                                                                                  | v0.0.61 |

## Observações

- **Responsável agora aceita E-MAIL ou ID** — ninguém precisa saber ID interno; a mensagem de erro ensina o formato.
- **Intl.DateTimeFormat NÃO existe no JSVM (goja)** — datas America/Sao_Paulo por aritmética UTC (UTC-3 fixo, amanhã = now+21h).
- **Helpers top-level invisíveis nos callbacks do JSVM** — lógica inline obrigatória; hooks são JS puro (sem TS).
- **Sem lembrete/inbox nesta task**: CA-2-09 é do card a434ca96. Nenhuma decisão real criada (provas com fixture).
- **Responsável fixture**: ts8k8hmzmvudj0m (criterios.fixture.criador@haisan.com.br).
