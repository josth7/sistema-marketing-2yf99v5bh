# Análise — f9a2a3eb: Preparar autenticação e cadastro dos perfis (SPEC-2-005, CA-2-12)

- Data: 2026-10-14 · Executor: Mikael · Projeto Skip: 61465 (Sistema Marketing)
- Versão no ar: v0.0.104 (578fc62), publicada 14/10 15:00 — igual à última testada ✓

## 1. Objetivo e resultado observável

Preparar a base de autenticação/autorização: catálogo de papéis, política de acesso no
backend e usuário novo SEM privilégio. Nada de grant/convite real (isso é do card 5b1de184
e exige matriz aprovada). Resultado observável: o servidor passa a VERIFICAR permissão
(action + escopo) em cada leitura/mutação dos módulos novos; sem login = 401, sem grant =
403; contas de teste isoladas provam isso; demo continua isolada.

## 2. Estado atual (baseline provada 14/10)

- Autenticação nativa PocketBase funciona (login por e-mail/senha; rotas com $apis.requireAuth()).
- 2 usuários fixture: criterios.fixture.criador@ e criterios.fixture.aprovador@haisan.com.br
  (senha Fixture@2026). NINGUÉM mais (listagem com RLS mostra só o próprio; login do criador 200).
- NENHUMA verificação de action/escopo: rotas dos módulos (alert-criteria, decisions,
  reports, inbox) autenticam mas NÃO verificam permissão por papel (só a regra específica
  de "quem criou não aprova a si mesmo" no criterios.js).
- Coleções: 8 — users, metricas_diarias, fontes_estado, alert_criteria, decisions, reports,
  report_policy, inbox_items. SEM role_catalog, access_grants, access_audit.
- Página de login nas telas /criterios, /decisoes, /relatorios, /caixa (padrão: formulário
  na própria página; authStore do SDK compartilhado).

## 3. Plano concreto (recorte mínimo do card)

### 3.1 Migração 0025 — coleções de acesso (plain objects — lição AP-2026-10-02-1758)

- role_catalog: role (text, único), label, actions (json — lista de actions), description, enabled (bool)
  - Seed das 4 roles da SPEC: direction, management, marketing, agency (CANDIDATAS — a matriz
    só vale de fato após aprovação no card 5b1de184)
- access_grants: user_id (relation users), role (text), scope_accounts (json),
  scope_channels (json), actions (json), valid_from (date), valid_until (date),
  approved_by (relation users), approved_at (date), revoked_at (date), version (number)
  - Índice único: (user_id, role, version)
- access_audit: append-only — at (date), actor (relation users), acao (text), alvo (text),
  detalhe (json); sem update/delete (regras null)
- RLS: leitura só do próprio registro (user_id = @request.auth.id) para grants; catálogo
  legível autenticado; audit só escrita por hooks.

### 3.2 Hook acessos.js — lib de permissão + rotas de administração

- Função INLINE (JSVM — sem helper top-level): temAction(userId, action) — lê grants válidos
  do usuário (valid_until vazio ou futuro, revoked_at vazio) e confere a action.
- Rotas (todas requireAuth):
  - GET /backend/v1/acessos/me → minhas permissões válidas (para a UI mostrar/ocultar)
  - GET /backend/v1/acessos/grants → lista grants (só quem tem manage_access)
  - POST /backend/v1/acessos/grants → cria grant (só manage_access; exige approved_by =
    o próprio ator autenticado + version; 422 sem campos; 409 duplicata)
  - POST /backend/v1/acessos/grants/{id}/revoke → revoga (só manage_access; grava audit)
  - GET /backend/v1/acessos/audit → trilha (só manage_access)
- NENHUM grant real criado nesta task (gate: matriz aprovada — card 5b1de184).

### 3.3 Guards nos módulos existentes (aplicação gradual — SPEC: "aplicar gates gradualmente")

- criterios.js: POST/PATCH exigem manage_criteria; approve exige approve_criteria
  (além da regra atual de não auto-aprovar); archive exige manage_criteria.
- decisoes.js: POST/PATCH/close exigem manage_decisions; GET lista exige read_decisions.
- relatorios.js + caixa.js + inbox: GET exige read_reports (caixa continua POR USUÁRIO — a
  regra de user_id já existe e permanece).
- ingestao.js/meta_ingestao_diaria.js: NÃO MEXER (autenticação de serviço preservada — SPEC).
- ping.js: remover a rota de diagnóstico /backend/v1/debug-policy (limpeza pendente do card
  anterior) — o /backend/v1/ping original fica.

### 3.4 Frontend mínimo

- Nenhuma tela nova de administração nesta task (UI não concede acesso — a gestão de grants
  é do card 5b1de184 com matriz aprovada).
- Páginas existentes: sem mudança de fluxo; se o /me disser sem permissão, as ações ficam
  ocultas e a mensagem explica ("sem permissão para esta ação — fale com o administrador").
- Login: padrão atual mantido (formulário na própria página).

## 4. Matriz critério → prova (CA-2-12)

| Critério                            | Prova                                                                                                                                                                                               |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sem login → 401                     | GET /backend/v1/acessos/me sem token = 401 (prova backend interno)                                                                                                                                  |
| Sem grant → 403                     | fixture SEM grant tenta POST grant = 403; fixture lê /me = lista vazia                                                                                                                              |
| Papel/approved_by forjado não eleva | POST grant com approved_by de outro/atual não confiada do corpo: o servidor usa e.auth.id; fixture sem manage_access = 403 mesmo enviando role admin                                                |
| Usuário novo sem privilégio         | Criar usuário de teste novo → /me vazio → 403 em tudo                                                                                                                                               |
| Demo isolada                        | Página pública/painel demo continua sem dados reais (verificação: abrir sem login)                                                                                                                  |
| Regressão ingestão                  | POST ingestão com token de serviço continua 200 (idempotência preservada)                                                                                                                           |
| Regressão módulos                   | fluxo atual do critério (criar draft com fixture) continua funcionando COM guard (fixture de teste recebe grant de teste isolado OU os fixtures ganham grants de teste explícitos — ver §6 decisão) |

## 5. Riscos e casos de erro

- RISCO 1 (o maior): aplicar guards nos módulos existentes PODE quebrar o fluxo atual dos
  fixtures (criterios/decisoes/relatorios/caixa usados pelo Josth nos testes anteriores).
  Mitigação: migração 0025 cria grants de TESTE explícitos para os 2 fixtures
  (criador: manage*criteria; aprovador: manage_criteria + approve_criteria + read*\* +
  manage_decisions), marcados no audit como fixture; nenhum grant de pessoa real.
- RISCO 2: rotas de ingestão (Meta/Google) — não tocar; autenticação de serviço é separada.
- Erros obrigatórios: 401 sem login, 403 sem action, 422 entrada inválida (campos/motivo),
  409 duplicata de grant (user+role+version), 404 alvo inexistente.
- Segurança/LGPD: audit SEM tokens/senhas; logs sanitizados; nenhuma credencial real como fixture.
- Linha vermelha (D17): validação de entrada em fronteira de confiança e negação por padrão
  são o PRÓPRIO escopo do card — sem dívida deliberada permitida aqui.

## 6. Decisões que a SPEC deixa para o cliente (DECISÃO DO CLIENTE)

1. Os usuários fixture (criador/aprovador) recebem grants de TESTE explícitos para continuar
   funcionando nos testes humanos? RECOMENDAÇÃO: sim (fico com isso porque mantém os testes
   dos cards anteriores funcionando sem inventar pessoa real).
2. O dono (Josth) já entra como primeiro usuário real com papel direction NESSA task ou só
   no 5b1de184? RECOMENDAÇÃO: só no 5b1de184 (esta task não cria grant real — gate da SPEC).

## 7. Roteiro de verificação

- Automática: QA do Skip (static/build/test) + TDD novo acessos.test.ts (prova RED→GREEN:
  temAction com grant válido/vencido/revogado/ausente).
- Ao vivo (backend interno + navegador): 401 sem token; /me vazio para usuário novo;
  403 sem manage_access em POST grant; grant de teste do fixture → fluxo do critério
  continua; revogação → 403 imediato; ingestão intacta; demo sem dados reais.
- Teste humano (Josth, ~3 min): entrar nas telas de sempre com o fixture → tudo funciona;
  tentar algo sem permissão (aprovar com o criador) → mensagem clara de 403.

## 8. Fora do recorte (teto do aceite)

- Nenhuma tela de gestão de acessos (5b1de184), nenhum grant de pessoa real, nenhum convite,
  nenhuma alteração na ingestão, nenhuma mudança visual além das mensagens de 403.
