# Análise — Implementar alertas por critério + fila de análise (SPEC-2-002, CA-2-06/07)

Data: 16/10/2026 · Executor: Mikael · Estado: aguardando_autorizacao

## Objetivo e resultado observável

Motor determinístico que avalia critérios APROVADOS sobre janelas fechadas e gera alertas na fila
`alerts` — item com métrica, canal/grupo, períodos, variação, critério gerador, responsável e
situação. Reexecução não duplica; regra sem aprovação ou base 0/null/incompleta não gera alerta.
Sem IA e sem alteração de anúncios. **Gate**: cron do avaliador nasce DESABILITADO (enabled=false)
— ativação real só após o workshop CL-003 (22/10) com limiares reais da Anézia; provas usam rota
tick de teste com fixture, como no job quinzenal (a70d5ab8).

## Estado atual (lido do projeto v0.0.135)

- `alert_criteria` (migração 0014): uuid, version, state draft/approved/archived, metric, canal,
  objetivo, result_type, natureza, direction, threshold_pct, min_base, period_kind
  (monthly/calendar_half), comparison_mode, responsible_user, created_by, approved_by/at, history.
- Rotas /backend/v1/alert-criteria (listar/criar/editar/aprovar/arquivar) com guards
  manage_criteria/approve_criteria e regra "quem criou não aprova a si mesmo" — INTACTAS.
- Coleção `alerts` NÃO EXISTE; motor NÃO EXISTE; cron `alerta_avaliador_diario` já referenciado
  como pausado na 0014 (\_cron_settings disabled=true).
- Padrão de job provado no projeto: relatorio_quinzenal.js (cron + rota tick de teste + lógica
  inline em cópias idênticas; $app.runInTransaction; idempotência por chave).

## Plano em código

1. **Migração 0029_alerts.js** (plain objects — lição AP-2026-10-08-1410):
   - coleção `alerts`: criterion_id (text), criterion_version (number), group_key (text),
     metric (text), canal (text), objetivo (text), result_type (text), natureza (text),
     direction (text), period_kind (text), period_current_start/end (text), period_prev_start/end
     (text), current_value (number), previous_value (number), variation_pct (number),
     trigger_summary (text), responsible_user (relation users), state (select
     open/in_review/decided/closed), history (json), UNIQUE(criterion_id, criterion_version,
     group_key, period_current_start, period_current_end).
   - reafirma cron `alerta_avaliador_diario` disabled=true.
2. **Hook pocketbase/hooks/alertas.js** (lógica INLINE nos callbacks):
   - cron `alertas_avaliador` 15 9 \* \* \* (09:15 UTC) + POST /backend/v1/alerts/tick (relógio de
     teste, guarda enabled=false por padrão) + GET /backend/v1/alerts (guard read_alerts) +
     PATCH /backend/v1/alerts/{id}/state (guard manage_alerts; transições open→in_review→decided
     →closed; decided exige decision_id; histórico append-only).
   - avaliador: para cada critério approved (state=approved), calcula janela atual (period_kind:
     monthly = 1º–último dia; calendar_half = 1–15 / 16–último) — SOMENTE o último intervalo
     encerrado antes de hojeRef (UTC-3 fixo); período anterior = intervalo imediatamente anterior
     do mesmo tipo; agrega metricas_diarias (origem='api') por grupo (canal+objetivo+result_type+
     natureza); comparação só quando ambos completos e mesma duração em dias; fórmula
     100\*(atual-anterior)/abs(anterior); base anterior 0/null ou < min_base não dispara; limiar
     inclusivo (>= threshold para increase, <= -threshold para decrease); grava alerta com
     snapshot dos valores e trigger_summary; idempotência pela chave única (replay não duplica);
     regra inválida não trava as demais (try/catch por critério).
3. **Página /alertas** (frontend): login na própria página (padrão das demais), lista da fila com
   estado/métrica/valores/variação/períodos/critério/responsável, ações de transição (Iniciar
   análise / Registrar decisão / Encerrar), menu novo no Layout.

## Matriz critério → prova (CA-2-06/07)

| Critério                                                                                            | Prova                                                                      |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| CA-2-06: fixture aprovada (lead pago, queda 20%, base>=10, calendar_half) 100→75 gera 1 alerta −25% | tick com relógio ref 01/10: janela 16–30/09 vs 01–15/09 (ambas 15 dias)    |
| 75→80 não cruza (−20% é o limite; −20% CRUZA — inclusivo; −19% não)                                 | tick com dados 75→80: variação +6,7% → 0 alertas; 100→80 = −20% → 1 alerta |
| CA-2-07: replay/retry 0 duplicatas                                                                  | rodar tick 2x: contagem igual                                              |
| base 0/null/incompleta/demo não dispara                                                             | fixtures com base 0 e null → 0 alertas                                     |
| draft/archived não dispara                                                                          | critério draft → 0 alertas                                                 |
| fila mantém prova                                                                                   | GET /alerts mostra criterion/version/períodos/valores                      |
| transições autorizadas                                                                              | PATCH state sem manage_alerts → 403; sequência completa 200                |

## Riscos e limites

- Cron nasce DESABILITADO (gate CL-003) — provas via rota tick com relógio de teste; nenhum
  alerta real até limiares aprovados no workshop (22/10).
- Dados demo NUNCA geram alerta (origem='api' apenas).
- Nenhuma alteração na ingestão Meta/Google, relatórios ou decisões.

## Teste humano

José confere: página /alertas lista o alerta fixture com −25%, transições funcionam e replay não
duplica (contagem igual após 2 ticks).

## Próximo passo

`aguardar autorização para implementar`.
