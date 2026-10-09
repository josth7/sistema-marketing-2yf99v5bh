# STATUS — Haisan / Fase 2

**Atualizado:** 2026-10-09 (17:00) · **Fase vigente:** 2, liberada para construção por Rodrigo.

Pacote completo em `04_fase-atual/`: 6 SPECs, TDD, índice e 12 tarefas. Os 12 cards possuem UUID.

## Progresso da fase 2

- **4/12 concluídas (33%)** — b327b4ea (objetivos + pago/orgânico) e 2b676a25 (comparação de períodos + indicadores) concluídas em 07/10; fc6d0f5a (cadastro de critérios de alerta em rascunho) em 08/10; edd618c7 (decisões com data de revisão obrigatória) em 09/10 — todas com testes humanos aprovados.
- **Card edd618c7 (v0.0.56–v0.0.64, QA 100%)**: coleção decisions (migração 0015) + rotas /backend/v1/decisions (GET/POST/PATCH/close) com validação no servidor (422 sem data/responsável/data passada/agendamento passado/fechar sem resultado; 409 PATCH sem expected_revision e em decisão encerrada; 403 alerta fora do escopo) e histórico append-only antes/depois; página /decisoes com login de teste (fixture) e menu Decisões. Responsável aceita E-MAIL ou ID (limite 200; e-mail externo recusado COM explicação). Duas rodadas de debug com teste humano: (1) e-mail no responsável era rejeitado + erros silenciosos (v0.0.61); (2) SDK PocketBase v0.26 guarda o corpo do erro em e.response — página cobre os dois formatos e descreve o erro de cada campo (v0.0.63). Provas ao vivo: 401/422×5/200×3/409×2/403 + GET idempotente; revalidações na produção (submit vazio → 4 erros descritos; e-mail externo → recusa explicada; e-mail fixture → 200). Produção publicada (v0.0.64, ref 3736415). Teste humano: "Testei e funcionou — pode concluir o card" (09/10 16:59). Evidências em 05_entregas/spec-2-003/testes.md; debug em 06_notas/debug/debug-2026-10-09-decisoes-responsavel-email.md. Sem lembrete/inbox nesta task (CA-2-09 é do card a434ca96).
- Painel out/2026 agora: objetivos separados (Alcance/Leads/Tráfego + "Não informado" com motivo), colunas CPC/CPM/Alcance, nenhum % inválido na tela.

## Validação da fase 1

Cinco cards concluídos e aceite José de outubro parcial em 06/10 preservados em `05_entregas/fase-1/`. CSV 60858a3a dispensado como contingência opcional, não implementado. **Aceite integral da fase 1 não confirmado:** validação do site em 07/10 encontrou objetivos desconhecidos com CPR, mistura pago/orgânico e variação entre períodos incompletos/desiguais. **As duas regressões obrigatórias foram corrigidas** (b327b4ea e 2b676a25); a dívida do mês completo (setembro Google, 1 dia coberto) permanece — backfill só com leitura autorizada ou aguardando histórico.

Relatório: `05_entregas/validacao-fase-1-2026-10-07.md` com capturas/snapshots. Evidências dos testes: `05_entregas/spec-2-001/testes.md`, `05_entregas/spec-2-002/testes.md` e `05_entregas/spec-2-003/testes.md`.

## Próxima ação

Esteira da fase 2 (00-INDICE): workshop de limiares com Anézia (b1200b57, !22/10) e cadastros em rascunho (3b491438 — template de relatório; f9a2a3eb — catálogo/auth de perfis) são elegíveis em paralelo, sem depender de OAuth/CSV/limiar real. Lembrete de decisão (a434ca96) segue após esta task.

## Gates delimitados

- Critérios reais de alerta: CL-003 com Anézia e aprovação registrada, sem limiar inventado.
- Envio real de relatório: confirmar quinzenas/inbox interna, destinatários e template; construir desabilitado até aprovação.
- Acesso real: matriz aprovada e grants de dono autorizado; agência negada por padrão.
- Alertas/comparações: usar somente recortes conhecidos, compatíveis e cobertos — contrato de cobertura implementado no card 2b676a25.
- Código: inspecionar versão viva do Skip; submódulo antigo não corresponde à implantação validada.

## Pendências registradas

- Job diário da Meta: alinhar ao filtro RN-06 da rota (linha orgânica vazia de 07/10 removida por migração 0011; o job pode gravar de novo).
- Produção tem backend próprio (totais divergem do preview): conferência de números é contra os nativos; manter publicação em dia após cada card concluído.
- Setembro Google incompleto (1 dia coberto): backfill só com leitura autorizada ou aguardar histórico.

Meta direta no Skip e Google pelo Maestro/Composio preservados. Contrato Meta em `06_notas/contrato-meta.md`. Pendências de marca/concorrência/lead qualificado continuam nos destinos próprios, sem bloquear construção fase 2.
