# Mapa — Sistema Marketing (versão Skip c4991d6 / v0.0.112)

## Rotas (src/App.tsx)

| Rota        | Página         | Serviços                                       |
| ----------- | -------------- | ---------------------------------------------- |
| /           | Index → Painel | fontes.ts, agregacao.ts                        |
| /criterios  | Criterios      | criterios.ts                                   |
| /decisoes   | Decisoes       | decisoes.ts                                    |
| /relatorios | Relatorios     | relatorio.ts, caixa.ts (tickTeste, republicar) |
| /caixa      | Caixa          | caixa.ts                                       |
| \*          | NotFound       | —                                              |

## Coleções (14/10)

| Coleção                 | Campos principais                                                                                                                                                                                                                                                                           | Regras                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| users (_pb_users_auth_) | email, name, avatar                                                                                                                                                                                                                                                                         | auth                                  |
| metricas_diarias        | data, canal, natureza, objetivo, objective_raw, result_type, alcance, impressoes, cliques, gasto, resultados                                                                                                                                                                                | list autenticada                      |
| fontes_estado           | fonte, ultima_carga, status                                                                                                                                                                                                                                                                 | autenticada                           |
| alert_criteria          | uuid, version, state, metric, canal, objetivo, result_type, natureza, direction, threshold_pct, min_base, period_kind, responsible_user, created_by, approved_by, approved_at, history                                                                                                      | autenticada                           |
| decisions               | title, responsible_user, review_date, state, expected_revision, history                                                                                                                                                                                                                     | autenticada                           |
| reports                 | uuid, period_start/end, quinzena, scope, template_version, policy_version, report_revision, supersedes_id, revision_reason, generated_by, generated_at, state, origem, data_snapshot_json, coverage_by_source, comparison_eligibility, warnings, alert_refs, decision_refs, idempotency_key | autenticada                           |
| report_policy           | fixture, enabled, timezone, periods, template_version, policy_version, approved_by, approved_at, recipient_user_ids, approval_record                                                                                                                                                        | autenticada                           |
| inbox_items             | report_id, user_id, scope, status, attempts, last_error, delivered_at, read_at                                                                                                                                                                                                              | list/view: user_id = @request.auth.id |
| role_catalog            | role, label, actions, description, enabled                                                                                                                                                                                                                                                  | autenticada                           |
| access_grants           | user_id, role, scope_accounts, scope_channels, actions, valid_from, valid_until, approved_by, approved_at, revoked_at, version, note                                                                                                                                                        | list/view: user_id = @request.auth.id |
| access_audit            | at, actor, acao, alvo, detalhe                                                                                                                                                                                                                                                              | append-only (regras nulas)            |

## Hooks backend (pocketbase/hooks/)

| Arquivo                 | Rotas                                                                 | Observação                                                                               |
| ----------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| acessos.js              | GET/POST /backend/v1/acessos/me, /grants, /grants/{id}/revoke, /audit | guards por action (manage_access); temAction inline; audit append-only                   |
| criterios.js            | GET/POST/PATCH /backend/v1/alert-criteria (+approve, +archive)        | requireAuth; guards manage/approve_criteria; regra "quem criou não aprova a si mesmo"    |
| decisoes.js             | GET/POST/PATCH /backend/v1/decisions (+close)                         | requireAuth; guards read/manage_decisions; validação servidor                            |
| relatorios.js           | GET /backend/v1/reports, GET /{id}, POST /generate                    | requireAuth (guard por action nos módulos de escrita)                                    |
| relatorio_quinzenal.js  | cronAdd + POST /tick + POST /reports/{id}/republish                   | 3 cópias da lógica (cron, tick, republish); destinatários por E-MAIL; autor recebe cópia |
| caixa.js                | GET /backend/v1/inbox, PATCH /inbox/{id}/read                         | por usuário (RLS); DateTime zerado = string vazia truthy                                 |
| ingestao.js             | POST /backend/v1/ingest?fonte=meta/google_ads                         | autenticação de serviço — NÃO MEXER                                                      |
| meta_ingestao_diaria.js | cron ingestão Meta                                                    | NÃO MEXER                                                                                |
| ping.js                 | GET /backend/v1/ping                                                  | debug-policy removida em 14/10 (404 provado)                                             |

## Componentes reutilizáveis

- src/components/ui/\* (shadcn — NÃO EDITAR)
- Layout.tsx (menu: Painel, Critérios, Decisões, Relatórios, Caixa)

## Padrões observados

- Rotas custom: /backend/v1/..., resposta {ok, ...} ou {ok:false, erro, campos, detalhe}
- Erros do SDK v0.26: corpo em e.response (alias e.data); páginas com rota custom usam leitor próprio (erros-custom.ts — AP-2026-10-14-1425)
- JSVM: lógica INLINE nos callbacks (sem helper top-level); Intl não existe (UTC-3 fixo)
- Campos json: no JSVM devolvem objeto (ou array de char-codes quando gravado como string); no frontend SDK v0.26 já vem parseado (parseJson aceita ambos)
- Migrações: plain objects {name, type} em new Collection (construtores tipados são descartados)
- Login: formulário na própria página (padrão Criterios/Caixa/Relatorios)
- Fixtures: criterios.fixture.criador/aprovador@haisan.com.br, senha Fixture@2026; grants de TESTE (migração 0025 — revogar na matriz real, card 5b1de184)

## Arquivos gerados que não se editam

- .skip.config.json, package.json, lockfiles, src/lib/pocketbase/client.ts, errors.ts, use-realtime.ts
