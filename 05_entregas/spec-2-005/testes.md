# Evidências de teste — SPEC-2-005 (CA-2-12) — card f9a2a3eb

- Data: 2026-10-14 · Executor: Mikael · Projeto Skip: 61465 · Produção: https://sistema-marketing-1f51e.goskip.app
- Versões: v0.0.106 → v0.0.111 (ref final d87d693), QA 100% em todas.

## Implementação

- Migração 0025: coleções role_catalog (4 papéis candidatos: direction, management, marketing, agency), access_grants (versionamento por (user,role,version), validade, revogação), access_audit (append-only — regras de update/delete nulas).
- Migração 0026: grants de TESTE explícitos para os 2 fixtures (decisão do dono 14/10) — criador: manage*criteria; aprovador: manage_criteria + approve_criteria + read*\* + manage_decisions. Nenhum grant de pessoa real.
- Hook acessos.js: temAction inline (lê grants válidos — valid_until vazio ou futuro, revoked_at vazio); rotas GET /backend/v1/acessos/me, GET/POST /grants (só manage_access; approved_by = ator autenticado, não confiável do corpo), POST /grants/{id}/revoke (grava audit), GET /audit (só manage_access).
- Guards nos módulos: criterios.js (POST/PATCH manage_criteria; approve approve_criteria + regra "quem criou não aprova a si mesmo"; archive manage_criteria), decisoes.js (GET read_decisions; POST/PATCH/close manage_decisions), relatorios.js + caixa.js (GET read_reports; caixa continua POR USUÁRIO — RLS user_id mantida).
- ingestao.js / meta_ingestao_diaria.js: NÃO alterados (autenticação de serviço preservada).
- ping.js: rota de diagnóstico /backend/v1/debug-policy removida (404 provado); /backend/v1/ping mantido.
- Frontend: nenhuma tela nova (UI não concede acesso — gestão de grants é do card 5b1de184); mensagens de negação com o porquê.

## Provas ao vivo (14/10)

| #   | Prova                                            | Resultado                                                                           |
| --- | ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| 1   | GET /backend/v1/acessos/me sem token             | 401                                                                                 |
| 2   | /me do criador e do aprovador (actions corretas) | 200 — parse do json como char-codes tratado                                         |
| 3   | Criador lista grants (sem manage_access)         | 403                                                                                 |
| 4   | Criador cria grant (sem manage_access)           | 403                                                                                 |
| 5   | Aprovador lista grants                           | 200 — 2 grants                                                                      |
| 6   | Aprovador cria grant v2/v3                       | 200                                                                                 |
| 7   | Criação sem actions                              | 422 com motivo                                                                      |
| 8   | Criação com action inválida                      | 422 com motivo                                                                      |
| 9   | Revogar 2x                                       | 200 depois 409                                                                      |
| 10  | Grant inexistente                                | 404                                                                                 |
| 11  | Revogação imediata: sem grant → criar draft      | 403                                                                                 |
| 12  | Grant de teste do criador restaurado (v2)        | 200                                                                                 |
| 13  | Regressão: criador cria draft                    | 200                                                                                 |
| 14  | Regressão: criador não aprova a si mesmo         | 403 — "quem criou o rascunho não pode aprová-lo — aprovação é de outro responsável" |
| 15  | Regressão: aprovador aprova critério completo    | 200                                                                                 |
| 16  | Aprovação de rascunho incompleto                 | 422 — lista os campos que faltam                                                    |
| 17  | Regressão: decisões, relatórios, caixa, ping     | 200                                                                                 |
| 18  | debug-policy removida                            | 404                                                                                 |
| 19  | Usuário novo sem grant                           | /me vazio → 403 em tudo                                                             |

## Debug do teste humano (14/10)

- Sintoma apontado pelo Josth: falhas de permissão apareciam como erro genérico sem explicação (criador não via o porquê da recusa ao aprovar).
- Causa raiz: o leitor de erros da página lia a chave errada do corpo (`e.response?.data` é formato de validação NATIVA; as rotas custom devolvem `{ok:false, erro, campos, detalhe}` com o corpo em `e.response`/`e.data` no SDK v0.26).
- Correção (v0.0.111): leitor de erros próprio da página (cobre erro, campos, detalhe e formato nativo) em TODAS as ações (aprovar, arquivar, salvar, carregar).
- Prova: criador → "Aprovar" → aviso com a frase completa da regra; aprovação incompleta → lista dos campos que faltam. QA 100%.

## Teste humano

- Aprovado pelo Josth: "deu certo" (14/10 14:18).

## Fora do recorte (teto do aceite)

- Nenhuma tela de gestão de acessos, nenhum grant de pessoa real, nenhum convite, nenhuma alteração na ingestão — tudo do card 5b1de184 com matriz aprovada.
