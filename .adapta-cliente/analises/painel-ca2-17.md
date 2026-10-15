# Análise — Reorganizar o painel consolidado (SPEC-2-007, CA-2-17)

Data: 15/10/2026 · Executor: Mikael · Estado: aguardando_autorizacao

## Objetivo e resultado observável

O painel fica claro de ler: filtros rotulados numa linha, fontes numa faixa única de chips,
"Atualizado às" no lugar do texto técnico, cartões com seta/cor/período de referência (ou o motivo
da SPEC-2-001), percentuais com vírgula, gráfico de evolução diária com lacuna em dia sem dado e
tabela legível no celular. **Mesmos números de antes para os mesmos filtros** (outubro/2026 real e
agosto/2026 demonstração).

## Estado atual (Painel.tsx v0.0.123, lido inteiro)

- Cabeçalho da página já no padrão (CabecalhoPagina, card CA-2-16) + selo DEMONSTRAÇÃO.
- Toggle Demonstração/Dados reais: 2 botões grandes (SPEC: Dados reais é o modo inicial;
  Demonstração vira seletor discreto com faixa âmbar). **Mudança de comportamento pedida pela
  SPEC**: modo inicial = Dados reais (hoje `useState(true)` = demo).
- AvisoOrigem: faixa grande com "RN-05" no texto (demo) e faixas por fonte empilhadas
  (AvisosCanal, 3 blocos) → viram faixa única de chips (Meta Ads, Google Ads, Meta orgânico) com
  estado e "atualizado às"; aviso do orgânico em texto curto.
- Linha técnica "N registros carregados (escopo do seu acesso aplicado no servidor)" → "Atualizado
  às HH:MM" + botão Recarregar (já existe).
- Filtros: 4 Selects SEM rótulo (placeholder é o rótulo) → rótulos visíveis (Período, Canal,
  Natureza, Objetivo) + botão Limpar filtros; layout: 1 linha ≥1024px, 2 colunas tablet, empilhado
  no celular.
- Kpi: valor + variação em texto cinza, sem seta/cor/período → seta ↑↓, cor pelo SENTIDO da métrica
  (SPEC: sobe=verde para Cliques/Impressões/Alcance/Resultados/CTR; sobe=vermelho para
  CPC/CPM/CPR; neutro cinza para Gasto), "vs. <período anterior>"; motivo da supressão quando
  houver (já existe via variacaoTxtComMotivo). Linha principal: Gasto, Resultados, CPR (só com 1
  objetivo), Cliques; secundária: Impressões, Alcance, CTR, CPC, CPM (só os que a tela já recebe).
- Percentuais: formatarPercentual usa toFixed(2) com PONTO (1.63%) → vírgula (1,63%); sinal −
  (menos tipográfico) na variação. formatarVariacao idem. **Cuidado**: formatarPercentual é usado
  em relatorios.ts também — mudar em types.ts muda os dois (é o desejado: pt-BR em tudo).
- Tabela por objetivo: sem cabeçalho fixo, números à esquerda → números alinhados à direita
  (tabular-nums), primeira coluna fixa, rolagem horizontal SÓ dentro da tabela no celular,
  explicação de CPR e CTR ao passar o mouse/toque no título da coluna (title/tooltip).
- Gráfico de evolução diária: NÃO EXISTE hoje → criar com série diária que o painel JÁ carrega
  (dataset tem registros por período; dia sem dado = lacuna, nunca zero; pago e orgânico em séries
  separadas; demo só no modo demo). Biblioteca: recharts JÁ está no projeto (chart.tsx do shadcn
  usa) — usar ele, sem dependência nova.
- Estados: semDados já existe (EstadoVazio-like); carregando/erro reais já existem — padronizar com
  os componentes base do CA-2-16.

## Plano em código (só interface — nenhuma rota, coleção, job ou cálculo muda)

1. `src/lib/marketing/types.ts`: formatarPercentual/formatarVariacao com vírgula + sinal −
   (Intl pt-BR; tabular-nums fica no CSS). REGRESSÃO: conferir relatorios.ts/relatorio.test.ts.
2. `src/pages/Painel.tsx` (arquivo principal):
   - modo inicial = Dados reais (`useState(false)`); toggle vira seletor discreto (2 botões
     pequenos) + faixa âmbar com selo quando demo;
   - AvisoOrigem+AvisosCanal → FaixaFontes (chips por fonte: nome, estado por cor+texto,
     "atualizado às HH:MM"; aviso do orgânico curto embaixo da faixa; sem RN-05);
   - linha técnica → "Atualizado às HH:MM" (última ingestão mais recente entre as fontes) +
     Recarregar;
   - filtros com Label visível + Limpar filtros; grid responsivo (lg:grid-cols-4, sm:grid-cols-2);
   - Kpi novo: props {titulo, valor, variacao (ComparativoPeriodo|null), sentido: 'sobe-bom'|
     'sobe-ruim'|'neutro', referencia} → seta (TrendingUp/Down/Minus), cor por sentido, "vs.
     anterior" ou motivo; CPR entra na linha principal quando objetivo único; linha secundária;
   - GraficoEvolucao (recharts, ComposedChart ou LineChart): Gasto e Resultados por dia do período
     filtrado, séries pago/orgânico separadas, dia sem dado = lacuna (connectNulls=false);
   - Tabela: th com title (CPR/CTR), números text-right tabular-nums, wrapper overflow-x-auto com
     min-w e sticky primeira coluna.
3. `src/components/base/estados.tsx`: nada muda (reuso).

## Matriz critério → prova (CA-2-17)

| Critério                                          | Prova                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------ |
| Filtros rotulados, texto inteiro, 1 linha ≥1024px | captura 1440px + labels visíveis                                               |
| Faixa única de chips com estado e horário         | captura; sem faixas empilhadas                                                 |
| Nenhum texto técnico                              | grep no Painel: sem "PocketBase", "api/csv", "RN-"                             |
| Cartões: seta+cor+período ou motivo               | captura com variação válida e com supressão                                    |
| Percentuais com vírgula                           | captura "1,63%" / "−31,5%"                                                     |
| Gráfico com lacuna em dia sem dado                | captura (demo tem dias sem dado?) — construir série do dataset                 |
| Tabela legível no celular                         | captura 360px                                                                  |
| Valores iguais antes×depois (out real, ago demo)  | tabela antes×depois por valor                                                  |
| Regras SPEC-2-001                                 | casos: CPR não somado, pago×orgânico separados, supressão com motivo, — ≠ zero |

## Riscos

- **Mudança de modo inicial (demo→real)**: quem usa sem login verá o aviso de acesso negado em vez
  do demo — a SPEC MANDA ("Dados reais é o modo inicial"); registrar na entrega.
- formatarPercentual muda relatórios também (desejado — pt-BR em tudo); rodar TDD do relatorio.
- Gráfico: série diária deriva do dataset já carregado; sem dado no dia = lacuna (connectNulls=false).
- Números: nenhum cálculo muda — só formatação; conferência antes×depois com mesmos filtros.

## Teste humano

José confere: filtros rotulados, faixa de chips, "Atualizado às", cartões com seta/cor/"vs.",
percentuais com vírgula, gráfico, tabela no celular — e que os números continuam iguais.

## Próximo passo

`aguardar autorização para implementar`.
