# AP-2026-10-06-1700 — zero em campo derivado não é dado real

- **Task**: 462da177 (análise) · **Data**: 2026-10-06 17:00 BRT
- **Sinal**: painel exibia CTR 0,00% com 2.200 cliques e 135.260 impressões.
- **Causa**: a fonte (hook de ingestão) grava `ctr`/`cpc`/`cpm` como **0** quando não calcula — e a agregação faz média ponderada com peso > 0, então 0 × peso / soma = 0. O "0" mascara a ausência de cálculo.
- **Correção (2 camadas, v0.0.31 + v0.0.32)**:
  1. Conversão (`ingestao.ts`): 0 de `ctr`/`cpc`/`cpm` → `null` (RN-06: não calculado ≠ zero).
  2. Agregação (`agregacao.ts`): quando a fonte não traz o valor, **deriva dos totais reais** do grupo — ctr = cliques/impressões×100, cpc = gasto/cliques, cpm = gasto/impressões×1000; valor presente na fonte prevalece; sem base para derivar → null ("—").
- **Prova**: TDD novo — ctr derivado 1,6266% · cpc 0,5210 · cpm 8,4748; fonte prevalece sobre derivado; sem impressões → cpm null.
- **Reutilizável**: RN-06 vale para QUALQUER campo derivado, não só métricas ausentes. Sempre que uma fonte grava 0 em campo que ela não calcula, tratar como null na conversão e derivar na agregação.
