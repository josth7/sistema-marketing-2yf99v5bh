# Roteiro — Workshop de limiares (22/10, 60–90 min)

**Participantes:** Anézia (decide os limiares) · Josth (valida) · Mikael (registra a ata e executa)
**O que destrava:** hoje estão PAUSADOS de propósito — avaliador de alertas (diário 09:15 UTC), lembretes de revisão (diário 09:30 UTC) e relatório quinzenal. Com as decisões daqui, eu crio as regras aprovadas, ativo os jobs e faço o teste ao vivo no mesmo dia.

---

## Parte 1 — Regras de alerta (CL-003)

Para CADA regra, preencher uma linha da tabela (todos os campos são obrigatórios):

| #   | Métrica | Canal | Objetivo | Tipo do resultado | Natureza | Direção | Limiar % | Base mínima | Calendário | Responsável |
| --- | ------- | ----- | -------- | ----------------- | -------- | ------- | -------- | ----------- | ---------- | ----------- |
| 1   |         |       |          |                   |          |         |          |             |            |             |
| 2   |         |       |          |                   |          |         |          |             |            |             |
| 3   |         |       |          |                   |          |         |          |             |            |             |

**Opções válidas em cada campo:**

- **Métrica:** gasto · cliques · impressões · alcance · resultados · cpc · cpm · ctr · custo_por_resultado
- **Canal:** meta_ads · google_ads · meta_organico
- **Objetivo:** alcance · trafico · engajamento · leads · vendas · video · nao_informado
- **Tipo do resultado:** conversoes · leads · impressoes · cliques · alcance · engajamento · vendas · video
- **Natureza:** pago · organico
- **Direção:** queda (decrease) · alta (increase)
- **Calendário:** mensal (1º–último dia) · quinzenal (1–15 / 16–fim)
- **Responsável:** usuário do sistema (hoje: josth7@icloud.com · anezia@haisan.com.br · haisan.ecmm@gmail.com)

**Sugestões de partida (PONTO DE PARTIDA — a Anézia decide e pode mudar tudo):**

1. **Resultados (leads)** · meta_ads · leads · leads · pago · **queda ≥ 20%** · base ≥ 10 · quinzenal · Anezia
2. **Gasto** · meta_ads · (dinheiro soma entre objetivos) · **alta ≥ 30%** · base ≥ R$ 100 · mensal · Anezia
3. **Custo por resultado** · meta_ads · leads · leads · pago · **alta ≥ 25%** · base ≥ 10 resultados · mensal · Anezia
4. **Cliques** · google_ads · trafico · cliques · pago · **queda ≥ 30%** · base ≥ 50 · quinzenal · Anezia

**Regras do jogo (como o sistema avalia):**

- Queda dispara quando a variação ≤ −limiar; alta quando ≥ +limiar. **O limiar é inclusivo** (queda de exatamente 20% cruza um limiar de 20%).
- **Base mínima** é o valor do período ANTERIOR — abaixo disso não alerta (evita porcentagem sobre número pequeno).
- Comparação é sempre com o período anterior do MESMO tipo (mensal vs mensal, quinzena vs quinzena).
- **Só janela fechada**: o alerta de outubro sai em 1º de novembro. Sem dados num dos dois períodos → não alerta (fica registrado o motivo).
- Dados demonstrativos nunca geram alerta. Reexecução não duplica.
- Quem cria a regra não pode aprová-la a si mesma — a aprovação sai da conta do aprovador indicado.

---

## Parte 2 — Relatório quinzenal (DH-07)

- [ ] Calendário confirmado: quinzenas 1–15 e 16–fim (sim/não/ajustar)
- [ ] Destinatários (e-mail de cada um): sugestão josth7@icloud.com + anezia@haisan.com.br (+ haisan.ecmm@gmail.com?)
- [ ] Template atual serve? (resumo pago/orgânico, comparativo com a quinzena anterior, decisões atrasadas)
- [ ] Autorizado a ATIVAR o job quinzenal? (hoje pausado)

## Parte 3 — Lembretes de decisão

- O lembrete vai ao **responsável da decisão** (quem tem permissão de gerenciar decisões — hoje: Anézia). Não existe destinatário extra a definir.
- [ ] Confirmado: lembrete só para o responsável (sem cópia para mais ninguém)?

---

## Parte 4 — Execução após o workshop (eu faço, no mesmo dia)

1. Criar cada regra aprovada no sistema (cadastro + aprovação pela conta do aprovador indicado)
2. Registrar a ata em `05_entregas/criterios-alerta-aprovados.md`
3. Ativar os crons autorizados (alertas · lembretes · relatório quinzenal se DH-07 confirmado)
4. Teste ao vivo com relógio de teste + conferência na fila /alertas e na caixa
5. Publicar a versão e avisar aqui

## Checklist da ata (preencher na reunião)

- [ ] Regra 1: todos os campos definidos
- [ ] Regra 2: todos os campos definidos
- [ ] Regra 3: todos os campos definidos
- [ ] DH-07: quinzenas ✓ · destinatários: **\_\_** · template ✓
- [ ] Responsável de cada regra definido
- [ ] Autorização para ativar os crons: sim/não
