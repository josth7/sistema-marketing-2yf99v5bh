# Ata — Workshop de limiares (ANTECIPADO em 16/10/2026)

**Decisão do dono (Josth):** workshop antecipado via formulário no chat do assistente — as 4 regras, os destinatários do relatório quinzenal e a ativação dos 3 crons foram aprovados pelo dono em 16/10/2026 10:01 (respostas registradas no formulário). A Anézia valida as regras na próxima conversa; ajustes posteriores seguem o fluxo normal (editar regra aprovada cria nova versão draft).

**Participantes:** Josth (decisão) · Mikael (execução e registro)
**Autorizações registradas:**

1. Criar as 4 regras de alerta abaixo (criadas pela Anézia — manage_criteria — e aprovadas pelo dono — approve_criteria; quem criou não aprovou a si mesmo)
2. Ativar **alerta_avaliador_diario** (09:15 UTC), **lembrete_revisao** (09:30 UTC) e **relatorio_quinzenal** (10:00 UTC) — "Sim — ativar alertas, lembretes e relatório quinzenal"
3. DH-07: quinzenas 1–15 / 16–fim confirmadas; destinatários do relatório: josth7@icloud.com, anezia@haisan.com.br, haisan.ecmm@gmail.com (prova do tick: "política real: 3 gravado(s) → 3 válido(s)")

## Regras aprovadas (CA-2-05 — identidade autorizada, versão e assinatura temporal)

| #   | Métrica             | Canal      | Objetivo      | Tipo do resultado | Natureza | Direção          | Limiar | Base mínima   | Calendário              | Responsável          | Aprovada por      |
| --- | ------------------- | ---------- | ------------- | ----------------- | -------- | ---------------- | ------ | ------------- | ----------------------- | -------------------- | ----------------- |
| 1   | resultados          | meta_ads   | leads         | leads             | pago     | decrease (queda) | 20%    | 10            | quinzenal (1–15/16–fim) | anezia@haisan.com.br | josth7@icloud.com |
| 2   | gasto               | meta_ads   | nao_informado | conversoes        | pago     | increase (alta)  | 30%    | R$ 100        | mensal                  | anezia@haisan.com.br | josth7@icloud.com |
| 3   | custo_por_resultado | meta_ads   | leads         | leads             | pago     | increase (alta)  | 25%    | 10 resultados | mensal                  | anezia@haisan.com.br | josth7@icloud.com |
| 4   | cliques             | google_ads | trafico       | cliques           | pago     | decrease (queda) | 30%    | 50            | quinzenal (1–15/16–fim) | anezia@haisan.com.br | josth7@icloud.com |

**Interpretações fechadas na ata (implementadas no avaliador v0.0.150):**

- **Tipo do resultado é DESCRITIVO** — a fonte Meta não separa tipo (result_type null) e o Google marca 'conversoes'; o avaliador agrupa por canal+objetivo+natureza e registra o tipo da regra como descrição do alerta (sem filtrar por um tipo que a fonte não fornece).
- **Base mínima em métrica de razão** (custo_por_resultado, cpc, cpm, ctr) compara o DENOMINADOR do período anterior (resultados/cliques/impressões); em métrica de soma compara o total anterior.
- **Períodos de calendário são completos por construção** — mensal compara mês fechado vs mês fechado (30↔31 dias comparáveis); quinzena vs quinzena. Proteção real = cobertura igual de dias com dados + base mínima (a leitura literal "mesma duração" bloquearia regras mensais em 8 meses por ano — set 30 vs ago 31).

## Provas da ativação (16/10, produção)

- 4 regras criadas (200) pela conta da Anézia e aprovadas (200) pela conta do dono — matriz real respeitada
- Avaliador executado: 4 critérios aprovados avaliados; **0 alertas reais** — motivo registrado: "base anterior ausente ou zero" (dados reais começam 30/09; sem período anterior completo não se inventa alerta — comportamento correto da SPEC)
- Relatório quinzenal: política real ATIVA com 3 destinatários válidos; snapshots gerados
- Lembretes: job executado (0 criados — nenhuma decisão real vencida)
- 2 achados corrigidos durante a ativação: parse de recipients char-codes no job quinzenal (2 cópias) e remoção do bloqueio de duração (2 cópias do avaliador)

## Correção de registro (16/10, após o fechamento)

Na preparação da validação antecipada da Anézia, 6 regras de TESTE (fixtures das provas do card f7591165) estavam misturadas às 4 regras reais na tela /criterios. A limpeza (arquivamento) errou o filtro de IDs e arquivou junto as regras reais "resultados" e "gasto". **Nada foi apagado** — histórico intacto. As duas foram recriadas com o MESMO conteúdo da ata e aprovadas pelo dono no mesmo dia (16/10); as versões originais ficam arquivadas como registro. Estado final conferido na tela e via API: exatamente 4 regras aprovadas (resultados/leads/meta_ads −20% quinzenal · gasto/meta_ads +30% mensal · custo_por_resultado/leads/meta_ads +25% mensal · cliques/trafico/google_ads −30% quinzenal) + fixtures e versões antigas arquivadas. Capturas em artifacts (tela logada como anezia@haisan.com.br).

## Próximos passos

- A Anézia valida as 4 regras (tela /criterios) — ajuste vira nova versão draft, prova antiga intacta
- Primeiros alertas reais saem quando houver dois períodos fechados com dados (a partir de 01/11 para outubro)
- Demonstração integrada da fase 2 em 03/11
