# Roteiro — Demonstração integrada da fase 2 (03/11, 60 min)

**Participantes:** Josth (valida) · Anézia (opera) · Mikael (executa e registra)
**Objetivo:** provar o ciclo completo ao vivo: regra aprovada → alerta na fila → decisão com revisão → lembrete na caixa → relatório quinzenal entregue. Regressão da fase 1 (pago/orgânico separados, objetivos explícitos, histórico completo) conferida no mesmo dia.

## Preparação (Mikael, 02/11)

- [ ] Conferir ingestão das APIs nativas (Meta direta + Google pelo Maestro) até 01/11
- [ ] Conferir que os 3 crons estão ativos e rodando (últimos logs 09:15/09:30/10:00 UTC)
- [ ] Conferir que outubro fecha com dois períodos comparáveis (quinzenas 1–15 e 16–31)
- [ ] Snapshot "antes" do painel (dados reais de outubro)
- [ ] Regenerar fixtures de demonstração isoladas (não tocam dados reais)

## Roteiro (ordem de execução)

### 1. Painel — números reais (5 min)

- Modo "Dados reais", outubro completo
- Pago e orgânico separados; objetivos explícitos (Alcance/Leads/Tráfego + "Não informado" com motivo)
- Percentuais com vírgula; "Atualizado às" com hora real; cobertura por canal no rodapé

### 2. Alerta real (10 min)

- Abrir **Alertas**: mostrar a fila com os alertas gerados pelo avaliador diário (09:15 UTC de 01/11)
- Cada alerta: regra geradora + versão, períodos comparados, valores, variação %, responsável
- Transição: Iniciar análise → Registrar decisão (vinculada) → Encerrar com justificativa
- Provar: reexecução não duplica; regra sem aprovação/base pequena não gera alerta (se houver caso no log)

### 3. Decisão com revisão (10 min)

- Abrir **Decisões**: decisão criada a partir do alerta (ou nova) com data de revisão obrigatória
- Mostrar histórico append-only e responsável

### 4. Lembrete na caixa (10 min)

- Abrir **Caixa** (login da Anézia): lembrete da decisão com etiqueta, título e "Abrir decisão"
- Marcar como lida; provar idempotência
- Mostrar que reagendamento cancela lembrete antigo e cria novo na data nova

### 5. Relatório quinzenal (10 min)

- Abrir **Relatórios**: snapshot da quinzena 16–31/10 gerado pelo job (10:00 UTC de 01/11)
- Comparativo com a quinzena anterior quando elegível (com motivo quando não é)
- Caixa: relatório entregue aos 3 destinatários (josth7@icloud.com, anezia@haisan.com.br, haisan.ecmm@gmail.com)
- Marcar como lida na caixa

### 6. Regressão fase 1 (10 min)

- Painel: CPR nulo com motivo em objetivo desconhecido; resultados só em grupos compatíveis
- Total geral sem soma incompatível; nenhuma % inválida na tela
- Histórico completo: comparativo entre períodos fechados com cobertura declarada

### 7. Permissões (5 min)

- Dono lê tudo; Anézia gerencia critérios/decisões; usuário marketing lê métricas
- Provar IDOR: registro de outra conta não aparece (escopo no servidor)

## Evidências a anexar (05_entregas/demo-fase-2/)

- [ ] Captura do painel (outubro real, pago/orgânico)
- [ ] Captura da fila de alertas com alerta real aberto
- [ ] Captura da decisão com revisão agendada
- [ ] Captura da caixa com lembrete + relatório
- [ ] Log do avaliador (criterios avaliados, motivos)
- [ ] Log do job quinzenal (snapshots, destinatários válidos)
- [ ] Aceite humano do Josth e da Anézia

## Critério de aceite (CA-2-14/15)

- Alerta só de regra aprovada ✓ (fila mostra regra + versão)
- Decisão sem revisão rejeitada ✓ (prova ao vivo)
- Relatório gerado sem intervenção manual ✓ (job 10:00 UTC)
- Ciclo integrado demonstrado ✓
- Regressão fase 1 comprovada ✓
- CSV não declarado como implementado (contingência dispensada)
