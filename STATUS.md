# STATUS — Haisan / Fase 2

**Atualizado:** 2026-10-13 (08:35) · **Fase vigente:** 2, liberada para construção por Rodrigo.

Pacote completo em `04_fase-atual/`: 6 SPECs, TDD, índice e 12 tarefas. Os 12 cards possuem UUID.

## Progresso da fase 2

- **5/12 concluídas (42%)** — b327b4ea (objetivos + pago/orgânico) e 2b676a25 (comparação de períodos + indicadores) em 07/10; fc6d0f5a (critérios de alerta em rascunho) em 08/10; edd618c7 (decisões com revisão obrigatória) em 09/10; 3b491438 (relatório executivo com períodos comparáveis) em 13/10 — todas com testes humanos aprovados.
- **Card 3b491438 (v0.0.66–v0.0.70, QA 100%)**: migração 0016 (coleção reports — snapshot imutável, UNIQUE period+scope+template+policy+revision, RLS autenticada), hook relatorios.js (GET lista/detalhe + POST /backend/v1/reports/generate com validação no servidor — 422 janela não-quinzena/quinzena em curso, 409 duplicata; agregação espelha agregacao.ts: CPR só em objetivo+tipo compatível (RN-01/CA-2-01), ausência ≠ zero (RN-06), cobertura por canal (CA-2-04), comparativo com a quinzena anterior só quando elegível com motivo (CA-2-03), decisões atrasadas 2+ ciclos destacadas, alertas vazios com aviso do workshop CL-003), serviço relatorio.ts + TDD (13 provas), página /relatorios (login fixture, seletor de quinzenas fechadas, prévia do template com fixture isolada e XSS renderizado como texto, lista com avisos, "Ver prévia" abre o snapshot). Provas ao vivo: 401/422×2/200×4/409 + tela provada no navegador. Produção publicada (v0.0.70, ref 96a4d3e). Teste humano: "Testei e funcionou — pode concluir o card" (13/10 08:32). Nada é enviado nesta fase — job/inbox/policy são do card a70d5ab8 (CA-2-11).
- Painel out/2026: objetivos separados (Alcance/Leads/Tráfego + "Não informado" com motivo), colunas CPC/CPM/Alcance, nenhum % inválido na tela.

## Validação da fase 1

Cinco cards concluídos e aceite José de outubro parcial em 06/10 preservados em `05_entregas/fase-1/`. CSV 60858a3a dispensado como contingência opcional, não implementado. **Aceite integral da fase 1 não confirmado:** validação do site em 07/10 encontrou objetivos desconhecidos com CPR, mistura pago/orgânico e variação entre períodos incompletos/desiguais. **As duas regressões obrigatórias foram corrigidas** (b327b4ea e 2b676a25); a dívida do mês completo (setembro Google, 1 dia coberto) permanece — backfill só com leitura autorizada ou aguardando histórico.

Relatório: `05_entregas/validacao-fase-1-2026-10-07.md` com capturas/snapshots. Evidências dos testes: `05_entregas/spec-2-001/testes.md`, `05_entregas/spec-2-002/testes.md`, `05_entregas/spec-2-003/testes.md` e `05_entregas/spec-2-004/testes.md`.

## Próxima ação

Esteira da fase 2 (00-INDICE): workshop de limiares com Anézia (b1200b57, !22/10) e cadastros em rascunho (f9a2a3eb — catálogo/auth de perfis) são elegíveis; a70d5ab8 (relatório quinzenal automático, CA-2-11) depende da política/destinatários confirmados pelo dono; f7591165 (alertas por critério, !27/10) depende de regras aprovadas no workshop.

## Gates delimitados

- Critérios reais de alerta: CL-003 com Anézia e aprovação registrada, sem limiar inventado.
- Envio real de relatório: confirmar quinzenas/inbox interna, destinatários e template; construir desabilitado até aprovação (o template foi aprovado pelo Josth no teste do 3b491438).
- Acesso real: matriz aprovada e grants de dono autorizado; agência negada por padrão.
- Alertas/comparações: usar somente recortes conhecidos, compatíveis e cobertos — contrato de cobertura implementado no card 2b676a25 e reusado no relatório (3b491438).
- Código: inspecionar versão viva do Skip; submódulo antigo não corresponde à implantação validada.

## Pendências registradas

- Job diário da Meta: alinhar ao filtro RN-06 da rota (linha orgânica vazia de 07/10 removida por migração 0011; o job pode gravar de novo).
- Produção tem backend próprio (totais divergem do preview): conferência de números é contra os nativos; manter publicação em dia após cada card concluído.
- Setembro Google incompleto (1 dia coberto): backfill só com leitura autorizada ou aguardar histórico.

Meta direta no Skip e Google pelo Maestro/Composio preservados. Contrato Meta em `06_notas/contrato-meta.md`. Pendências de marca/concorrência/lead qualificado continuam nos destinos próprios, sem bloquear construção fase 2.
