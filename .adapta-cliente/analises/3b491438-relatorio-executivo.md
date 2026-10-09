# Análise — card 3b491438 (SPEC-2-004, CA-2-10): montar relatório executivo com períodos comparáveis

**Data**: 09/10/2026 · **Executor**: Mikael · **Estado da análise**: aguardando autorização

## 1. Objetivo e resultado observável

Relatório executivo de **quinzena fechada** (1–15 / 16–fim do mês), **factual e sem IA**, com:
fontes/datas/cobertura, indicadores por natureza/objetivo/tipo (regras da SPEC-2-001), comparação
entre janelas só quando válida (senão suprimida com motivo), fila de alertas (vazia — nenhuma regra
aprovada) e decisões com destaque das atrasadas por 2+ ciclos. Snapshot **persistido e imutável**
(coleção `reports`), acesso só autenticado. **Prévia demonstrativa isolada** do template com fixture.

**Fora deste card** (é o card a70d5ab8, CA-2-11): job diário automático, `report_policy`, caixa de
entrada (`inbox_items`), envio/retry/entrega. Este card entrega o **template + geração manual
autenticada + persistência** — nada é enviado a ninguém.

## 2. Estado atual (inspecionado no projeto vivo 61465, v0.0.65)

- **Não existe** coleção de relatórios, rota de relatório ou página — construção do zero.
- **Existe e será REUSADO** (sem reescrever): `src/lib/marketing/agregacao.ts` (RN-01/02/06,
  cobertura por canal, veredito CA-2-03/04), `types.ts` (somar/variacao/custoPorResultado),
  padrão de hook com rotas `/backend/v1/` (decisoes.js), padrão de página com login fixture
  (Decisoes.tsx/Criterios.tsx), migração 0006 (padrão de índice UNIQUE).
- **Dados reais disponíveis**: metricas_diarias com Meta 2 dias/Google 1 dia em setembro (cobertura
  parcial) — perfeito para provar "fonte parcial não impede relatório factual com aviso".
- **Decisões**: coleção decisions (v0.0.64) com estados aberta/encerrada e review_date — o relatório
  lista as abertas e destaca atrasadas.
- **Baseline**: produção publicada (1d4b0be), working tree limpo (só .skip.config.json da
  plataforma). Nenhuma falha preexistente.

## 3. Plano de implementação (menor recorte completo)

### Migração 0016 — coleção `reports` (plain objects — AP-2026-10-08-1410)

- Campos: uuid, period_start, period_end, quinzena (1|2), scope, template_version ('1.0.0'),
  policy_version (null nesta fase), report_revision (int, 1), supersedes_id, revision_reason,
  generated_at, origem, state ('draft'), data_snapshot_json (json), coverage_by_source (json),
  comparison_eligibility (json), warnings (json), alert_refs (json), decision_refs (json)
- Índice UNIQUE: period_start+period_end+scope+template_version+policy_version+report_revision
- Regras: list/view = autenticado; create/update/delete = vazio (só hooks — igual decisions)

### Hook `pocketbase/hooks/relatorios.js` (JS puro, lógica inline — AP do JSVM)

- **POST /backend/v1/reports/generate** `{period_start, period_end, scope?}` (401 sem login;
  422 período não é quinzena fechada/fim >= hoje SP; 409 chave duplicada):
  valida janela exata de quinzena (1–15 ou 16–último dia, mês fechado), lê `metricas_diarias`
  sobrepostas à janela, monta o snapshot com as mesmas regras de agregação (reescritas em JS inline,
  espelhando agregacao.ts), cobertura por fonte, eligibility da comparação (janela anterior de
  mesmo tamanho: a outra quinzena), warnings, decisões abertas + atrasadas (review_date < hoje-30d
  = atrasada 2+ ciclos → flag `atrasada: true`), alert_refs=[] com aviso "nenhuma regra aprovada".
  Grava state='draft' (prévia — sem envio). Datas SP por aritmética UTC (UTC-3).
- **GET /backend/v1/reports** e **GET /backend/v1/reports/{id}** (401 sem login)
- Sem rota pública, sem cron neste card.

### `src/lib/marketing/relatorio.ts` + `relatorio.test.ts` (TDD local)

- Tipos do snapshot + **fixture isolada** (origem='demonstracao', payload `<img src=x onerror=...>`
  incluído como texto para provar escape) + funções puras do template:
  `destaqueAtrasada(decisao, hoje)`, `blocoComparativo(snapshot)`, `resumoFactual(snapshot)`
  (texto curto factual: fontes, datas, limitações — sem IA).
- Testes: atrasada ≥2 ciclos destacada · comparação inválida suprimida com motivo ·
  ausência ≠ zero (—" em indisponível) · payload XSS renderizado como texto (prova no componente).

### `src/pages/Relatorios.tsx` + rota `/relatorios` + menu "Relatórios"

- Login de teste (fixture, mesmo padrão)
- **Gerar relatório**: seletor de quinzenas fechadas (derivadas do dataset real) + botão gerar →
  draft persistida
- **Prévia do template (demonstração)**: template renderizado com a fixture isolada (não persiste,
  não toca dados reais) — é onde o template é aprovado
- **Relatórios gerados**: lista (período, estado, gerado em, avisos) + prévia renderizada do
  snapshot persistido (texto escapado, sem dangerouslySetInnerHTML)

## 4. Ficha de Tela (Relatorios.tsx)

- Cabeçalho: "Relatório executivo (prévia)" + "Resumo factual da quinzena — sem IA; comparação só
  quando as janelas são comparáveis; nada é enviado nesta fase"
- Login: e-mail/senha fixture + Sair (padrão Decisões)
- Card 1 "Gerar relatório da quinzena": select (ex.: "2ª quinzena de set (16–30/09)") + botão
  "Gerar prévia" + aviso de erro/sucesso descrito (padrão corrigido no edd618c7)
- Card 2 "Prévia do template — demonstração": blocos → Período e gerado em · Fontes e cobertura
  (chips por canal com dias) · Indicadores pago (tabela por objetivo: gasto, impressões, cliques,
  resultados, CPR) · Indicadores orgânico · Comparativo (valor ou motivo da supressão) · Alertas
  (vazio: "nenhuma regra aprovada — workshop 22/10") · Decisões (abertas; atrasada 2+ ciclos com
  badge vermelho) · Avisos do período
- Card 3 "Relatórios gerados": lista + botão ver prévia (renderiza o snapshot do banco)

## 5. Matriz critério → prova

| Critério (CA-2-10)                     | Prova                                                                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Fonte/datas/cobertura no relatório     | generate 16–30/09 → coverage_by_source com Meta/Google e dias reais + warnings de cobertura parcial          |
| Blocos por natureza/objetivo/tipo      | snapshot com pago/organico separados; CPR só em grupo compatível (regra reusada); "Não informado" com motivo |
| Não inventa % em janela inválida       | comparativo 16–30/09 vs 01–15/09 → variacaoPercentual=null + motivo "cobertura desigual"                     |
| Não inventa métricas/IA                | resumo factual só com dados do snapshot; campos ausentes como "—"                                            |
| Decisões atrasadas 2 ciclos destacadas | fixture decision com review_date 30+ dias passada → flag atrasada + badge                                    |
| Snapshot imutável                      | 2º generate do mesmo período/revision → 409; registro não muda                                               |
| Erros obrigatórios                     | 401 sem login · 422 janela inválida/quinzena em curso · 409 duplicata                                        |
| Isolamento demo/real                   | prévia do template usa fixture origem='demonstracao'; relatório real nunca lê fixture                        |
| Segurança XSS                          | payload `<img src=x onerror=alert(1)>` na fixture aparece como texto                                         |
| Acesso                                 | GET sem login 401; com login 200; sem URL pública com dados                                                  |

## 6. Riscos

- **JSVM**: reescrever agregação em JS inline no hook (sem import de TS) — risco de divergência;
  mitiga: espelhar agregacao.ts linha a linha e provar com os mesmos fixtures do agregacao.test.ts
  (caso vídeo 940/1540 sem CPR 0,61).
- **Índice UNIQUE em migração**: seguir o padrão do 0006; conferir schema com
  get_collection_details após criar (AP-2026-10-08-1410).
- **JSON grande no snapshot**: limitar aos agregados (não linhas de campanha cruas) — snapshot de
  totais/linhas por objetivo, não dump do dataset.
- **Não tocar**: ingestão Meta/Google, jobs existentes, coleções decisions/alert_criteria.
- **LGPD/dados**: snapshot só com dados de campanha (agregados); sem dados pessoais; acesso
  autenticado; logs sanitizados.

## 7. Decisões do cliente / impedimentos

- **Nenhum impedimento** para construir (rascunho + prévia demonstrativa são elegíveis).
- **DECISÃO DO CLIENTE (no teste humano)**: aprovação do TEMPLATE em si — a prévia demonstrativa é
  exatamente para isso; ajustes de layout/blocos são feitos antes do card de envio (a70d5ab8).
- Política (calendário/destinatários/aprovação real) = card a70d5ab8 com gate do dono.

## 8. Roteiro de verificação e teste humano

1. QA Skip 100% (static/build/integrations) + TDD local (relatorio.test.ts)
2. Provas ao vivo: 401 · 422 janela inválida · 409 duplicata · generate 16–30/09 → draft com
   cobertura/avisos reais · GET lista/detalhe
3. **Teste humano (Josth)**: abrir /relatorios → ver a PRÉVIA DO TEMPLATE (demonstração) → gerar
   prévia da 2ª quinzena de setembro → conferir blocos, avisos de cobertura e decisão destacada →
   aprovar o template (ou pedir ajuste)
