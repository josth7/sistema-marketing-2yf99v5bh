# Análise — card a70d5ab8 (SPEC-2-004, CA-2-11): relatório quinzenal automático

Data: 13/10/2026 · Executor: Mikael · Análise anterior à implementação (portão: aguardando autorização)

## Objetivo e resultado observável

Com uma política de envio APROVADA (fixture), o JOB do backend gera e entrega o relatório da quinzena
recém-fechada SEM ação manual: 1 snapshot + 1 item por destinatário autorizado na caixa de entrada.
Replay/concorrência/retry não duplicam; não autorizado ou revogado não lê/recebe. A política REAL
permanece `enabled=false` até o Josth confirmar calendário/destinatários (DH-07).

## Estado atual (v0.0.73, ref 128333e, publicada 11:47:13Z)

- `reports` (migração 0016): snapshot imutável, UNIQUE(period,scope,template,policy_version,revision),
  state draft/ready/delivered/failed — hoje só 'draft' via POST /backend/v1/reports/generate (manual).
- `relatorios.js`: GET lista/detalhe + POST generate (agregação completa: natureza/objetivo, CPR
  compatível, cobertura, comparativo elegível, decisões atrasadas, alertas vazios com aviso).
- `meta_ingestao_diaria.js`: padrão de job = cronAdd global 09:00 UTC, lógica INLINE (JSVM).
- NÃO EXISTE ainda: report_policy, inbox_items, job quinzenal, caixa de entrada, republicação.
- Fixture users existentes (0013): criterios.fixture.criador / criterios.fixture.aprovador@haisan.com.br.

## Plano em código (ordem: migration → hook → serviço → componentes → página → rota/menu)

### 1. Migração 0017 — `report_policy` (plain objects; conferir schema depois)

Campos: fixture (bool, default false) · enabled (bool, default false) · timezone (text, def.
America/Sao_Paulo) · periods (text, def. calendar_halves) · template_version (text, def. 1.0.0) ·
policy_version (number, def. 1) · approved_by (relation users) · approved_at (date) ·
recipient_user_ids (json, lista de ids) · approval_record (json: quem/quando/trecho) · created/updated.
Registros criados: (a) REAL fixture=false enabled=false recipients=[] — aguarda Josth;
(b) FIXTURE fixture=true enabled=true approved_by=aprovador fixture approved_at=now
recipients=[id do criador fixture] approval_record="política de teste (fixture) para CA-2-11".
RLS: list/view autenticado; create/update/delete null (só rotas do servidor).
Job processa TODA política enabled=true && approved_at!=null; relatórios da política fixture
recebem scope='fixture' (visível na lista, não colide com relatórios reais de scope='').

### 2. Migração 0018 — `inbox_items`

Campos: report_id (text, required) · user_id (relation users, required) · scope (text) ·
status (select pending/delivered/failed) · attempts (number, def. 0) · last_error (text) ·
delivered_at (date) · read_at (date) · created/updated.
UNIQUE (report_id, user_id). RLS: list/view = user_id = @request.auth.id (cada um vê só o seu);
create/update/delete null (escrita só via hooks).

### 3. Migração 0019 — campo aditivo em `reports`

idempotency_key (text, max 64) + índice. Sem tocar em campo existente; down remove o índice/campo.

### 4. Hook novo `pocketbase/hooks/relatorio_quinzenal.js`

- cronAdd('relatorio_quinzenal','0 10 \* \* \*') — 10:00 UTC (06:00 BRT), SPEC. Lógica INLINE:
  tick(app, hojeRef) varre quinzenas fechadas (fim < hojeRef) dos últimos ~65 dias SEM snapshot
  revision=1 para cada política ativa → gera snapshot (agregação COPIADA de relatorios.js — JSVM
  não compartilha código entre hooks; padrão já usado no job da Meta) + cria outbox na MESMA
  transação ($app.runInTransaction) com state='delivered'.
- Entrega: antes de criar o item valida que o usuário destinatário EXISTE (revogado/removido →
  não recebe, registrado no aviso do job).
- Retry: item pending com attempts<3 e last_attempt antigo (>1min p/ 2ª, >5min p/ 3ª) é reentregue
  no próximo tick; 3 falhas → status failed + last_error visível. Retomada administrativa:
  POST /backend/v1/inbox/{id}/retry (autenticada) — attempts++, revalida, entrega ou falha.
  Nota honesta: o cron é DIÁRIO — as janelas de 1/5 min são honradas pelo tick administrativo
  (relógio de teste) e pela mesma lógica no cron; tempo real de 1/5min não é garantido pelo cron.
- POST /backend/v1/reports/tick {data?} — MESMA lógica do cron com relógio de teste
  (autenticada; NUNCA pública). Prova RED/GREEN sem esperar 15 dias.
- POST /backend/v1/reports/{id}/republish {revision_reason, idempotency_key} — republicação
  administrativa: gera NOVA revisão (max+1) com supersedes_id + motivo, snapshot novo do dado
  ATUAL, outbox por NOVO report_id para os destinatários ATUAIS (revogado não recebe a revisão 2);
  replay da MESMA idempotency_key devolve a MESMA revisão (não cria 3ª); chaves diferentes criam
  revisões distintas auditadas. 422 sem motivo/sem chave; 409 se a fonte não for encontrada.
- GET/PATCH /backend/v1/report-policy — leitura autenticada; alteração administrativa
  (enabled/recipients/approval_record) para ativação futura com aprovação registrada.

### 5. Hook novo `pocketbase/hooks/caixa.js`

GET /backend/v1/inbox (itens do próprio usuário, com período/estado do relatório) ·
PATCH /backend/v1/inbox/{id}/read (SÓ o destinatário — 403 para outro; idempotente).

### 6. Alinhamento SPEC em `relatorios.js` (generate)

Filtro origem='api' na leitura de metricas_diarias (SPEC: nunca gerar relatório real a partir do
dataset demonstrativo). Não muda nenhuma prova existente (todas as linhas reais são origem='api');
prova nova: linha demonstracao na janela é EXCLUÍDA do snapshot.

### 7. Serviço + telas

- `src/lib/marketing/caixa.ts`: listarCaixa(), marcarLida(id), republicar(id, motivo, chave),
  tickTeste(data?) — erros em PT-BR lendo e.response?.data ?? e.response ?? e.data (AP-2026-10-09-1700).
- Página nova `src/pages/Caixa.tsx` (rota /caixa + item no menu): lista dos MEUS itens
  (período, entregue em, lido/não lido), botão "Marcar como lida", "Ver relatório" abre o snapshot
  existente (mesma prévia de /relatorios). Estados: carregando/vazio ("nenhum relatório recebido
  ainda")/erro com saída. Celular: lista em cards. Campos com rótulo, foco visível, alvos ≥44px.
- `src/pages/Relatorios.tsx`: botão "Republicar com motivo" (AlertDialog com campo de motivo +
  idempotency_key gerada por abertura de diálogo — reabrir o mesmo diálogo mantém a chave p/ replay);
  aviso fixo "Envio automático: DESATIVADO — aguarda confirmação de calendário e destinatários".

## Ficha de Tela — Caixa de entrada (`/caixa`)

- Quem usa: destinatários da política (Josth/Anézia/time quando ativado); computador e celular.
- Tarefa: ver os relatórios que me foram entregues e abrir cada um.
- Ação primária: "Ver relatório". Secundária: "Marcar como lida".
- Padrão: lista simples (cards no celular), badge de não lido por TEXTO+cor (nunca só cor).
- Dados: inbox_items ← GET /inbox (período, status, entregue em — data pt-BR).
- Permissões: RLS user_id = @request.auth.id + rota valida no servidor (403 para outro usuário).
- Estados: carregando · vazio de primeiro uso · erro com "Tentar novamente" · sucesso.
- Acessibilidade: rótulos, Enter abre, Esc fecha diálogo, contraste 4,5:1.
- Reuso: padrão visual de /relatorios e /decisoes (mesmos componentes ui/).

## Teste de mesa (regras novas)

| Entrada                                                | Ação           | Saída esperada                                                                                     |
| ------------------------------------------------------ | -------------- | -------------------------------------------------------------------------------------------------- |
| Política real enabled=false + tick 16/10               | job            | NENHUM relatório/inbox criado (gate)                                                               |
| Política fixture enabled+aprovada + tick data=16/10    | job            | 1 snapshot (scope=fixture, revision=1, state=delivered) + 1 item p/ destinatário, sem clicar Gerar |
| Mesmo tick 2× (replay)                                 | job            | contagens IGUAIS (UNIQUE) — sem duplicar                                                           |
| Destinatário removido antes do tick                    | job            | item NÃO criado + aviso no job                                                                     |
| Destinatário revogado lê item de outro usuário         | PATCH read     | 403                                                                                                |
| Entrega falha (usuário removido no meio) ×3 tentativas | retry          | status failed + last_error visível                                                                 |
| Republicar sem motivo ou sem chave                     | POST republish | 422 com campo descrito                                                                             |
| Republicar revisão 1 (chave K1) e replay K1            | POST republish | MESMA revisão 2 nas duas chamadas                                                                  |
| Republicar de novo com chave K2                        | POST republish | revisão 3 nova, supersedes_id=rev2                                                                 |
| Cron depois das republicações                          | job            | revision=1 já existe → não republica silenciosamente                                               |
| Linha origem=demonstracao na janela                    | generate/tick  | EXCLUÍDA do snapshot (origem='api' only)                                                           |

## Matriz critério → prova (CA-2-11)

- Job gera e entrega sem ação manual → tick com relógio 16/10 + política fixture: snapshot+item no banco (prova no banco, não clique).
- Replay/concorrência não duplicam → tick 2× + 2 chamadas paralelas: contagens iguais (UNIQUE reports e inbox_items).
- Retry não duplica → 3 tentativas no mesmo item: attempts=3, status failed, 1 único item.
- Não autorizado/revogado não lê/recebe → item não criado p/ removido; PATCH read de outro usuário = 403; RLS só os próprios itens.
- Republicação com motivo/idempotência → provas da tabela acima (revisão 2 supersedes 1; replay = mesma revisão).

## Riscos

1. **Agregação duplicada no job** (JSVM): divergência futura entre generate e job — mitigação: código copiado idêntico + prova de snapshot IGUAL entre generate manual e tick na mesma janela (comparação de blocos).
2. **Produção tem backend próprio** (dado já registrado): testes ao vivo na PRODUÇÃO e conferência contra os nativos; preview não serve de prova de dados.
3. **Política fixture ativa gera relatórios scope='fixture'** na lista — visível e rotulado; não colide com reais (scope='' e UNIQUE inclui scope).
4. **Migração 0019 aditiva** (campo novo) — sem tocar em dado existente; down remove só o campo novo.
5. **Cron diário × janelas de 1/5min**: retomadas provadas via tick administrativo; tempo exato não garantido pelo cron (registrado como limitação honesta).

## Impedimentos / decisões do cliente (não bloqueiam construção; ativam o envio REAL)

1. **Calendário**: quinzenas de calendário (1–15 e 16–fim do mês) — confirmado?
2. **Destinatários reais**: quem recebe o relatório (Josth? Josth + Anézia? time de marketing?).
   Enquanto não confirmado: política REAL enabled=false (nada é entregue de verdade); o card constrói
   e prova com a política FIXTURE. (DH-07)

## Roteiro de teste humano (produção, ≤8 passos)

1. Abrir https://sistema-marketing-1f51e.goskip.app/caixa e entrar com o usuário de teste.
2. Ver a caixa de entrada: o relatório da quinzena fixture entregue pelo JOB (sem eu clicar em Gerar).
3. Abrir "Ver relatório" — o snapshot abre igual ao de /relatorios.
4. Clicar "Marcar como lida" — item passa a lido.
5. Em /relatorios, clicar "Republicar com motivo", escrever o motivo e confirmar — revisão 2 criada.
6. Republicar de novo com o MESMO diálogo (mesma chave) — NÃO cria revisão 3 (volta a mesma).
7. Conferir que a lista mostra o aviso "Envio automático: DESATIVADO — aguarda sua confirmação".
8. No celular, abrir /caixa — lista legível em cards, sem rolagem horizontal.
