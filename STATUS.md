# STATUS — Haisan / Fase 2

**Atualizado:** 2026-10-14 (11:55) · **Fase vigente:** 2, liberada para construção por Rodrigo.

Pacote completo em `04_fase-atual/`: 6 SPECs, TDD, índice e 12 tarefas. Os 12 cards possuem UUID.

## Progresso da fase 2

- **6/12 concluídas (50%)** — b327b4ea (objetivos + pago/orgânico) e 2b676a25 (comparação de períodos + indicadores) em 07/10; fc6d0f5a (critérios de alerta em rascunho) em 08/10; edd618c7 (decisões com revisão obrigatória) em 09/10; 3b491438 (relatório executivo com períodos comparáveis) em 13/10; a70d5ab8 (relatório quinzenal automático + caixa de entrada) em 14/10 — todas com testes humanos aprovados.
- **Card a70d5ab8 (v0.0.74–v0.0.103, QA 100%)**: migrações 0017–0019 (report_policy, inbox_items com UNIQUE report+user, idempotency_key) e 0020–0024 (correções de dados); hook relatorio_quinzenal.js (cron 10:00 UTC + tick de teste + republish com motivo obrigatório e idempotência — replay devolve a MESMA revisão; destinatários resolvidos por E-MAIL na entrega; autor da republicação recebe cópia) e hook caixa.js (GET /backend/v1/inbox por usuário + PATCH /{id}/read idempotente, 403/404); página /caixa com login na própria página (caixa POR USUÁRIO — RLS). Job automático DESATIVADO aguardando calendário/destinatários do dono (DH-07 — workshop 22/10). Provas ao vivo: entrega 4+4 sem duplicar, marcar-lida persiste, republish + replay, 422 sem motivo, prévia completa sem erro de console, autor recebe cópia (rev 6, caixa 6→7). 6 defeitos de teste humano corrigidos com causa raiz provada. Produção v0.0.103 (ref 32bf30a). Teste humano: "pode concluir" (14/10 11:54).
- Painel out/2026: objetivos separados (Alcance/Leads/Tráfego + "Não informado" com motivo), colunas CPC/CPM/Alcance, nenhum % inválido na tela.

## Validação da fase 1

Cinco cards concluídos e aceite José de outubro parcial em 06/10 preservados em `05_entregas/fase-1/`. CSV 60858a3a dispensado como contingência opcional, não implementado. **Aceite integral da fase 1 não confirmado:** validação do site em 07/10 encontrou objetivos desconhecidos com CPR, mistura pago/orgânico e variação entre períodos incompletos/desiguais. **As duas regressões obrigatórias foram corrigidas** (b327b4ea e 2b676a25); a dívida do mês completo (setembro Google, 1 dia coberto) permanece — backfill só com leitura autorizada ou aguardando histórico.

Relatório: `05_entregas/validacao-fase-1-2026-10-07.md` com capturas/snapshots. Evidências dos testes: `05_entregas/spec-2-001/testes.md`, `05_entregas/spec-2-002/testes.md`, `05_entregas/spec-2-003/testes.md` e `05_entregas/spec-2-004/testes.md`.

## Próxima ação

Esteira da fase 2 (00-INDICE): workshop de limiares com Anézia (b1200b57, !22/10) e cadastros em rascunho (f9a2a3eb — catálogo/auth de perfis) são elegíveis; f7591165 (alertas por critério, !27/10) depende de regras aprovadas no workshop; a434ca96 (lembrete de revisão, !29/10) reusa a caixa de entrada do a70d5ab8.

## Gates delimitados

- Critérios reais de alerta: CL-003 com Anézia e aprovação registrada, sem limiar inventado.
- Envio real de relatório: confirmar quinzenas/inbox interna, destinatários e template — job construído e DESATIVADO até a confirmação do dono (DH-07); quando a política real for preenchida com E-MAILS, o job resolve e-mail→usuário na entrega.
- Acesso real: matriz aprovada e grants de dono autorizado; agência negada por padrão.
- Alertas/comparações: usar somente recortes conhecidos, compatíveis e cobertos — contrato de cobertura implementado no card 2b676a25 e reusado no relatório (3b491438).
- Código: inspecionar versão viva do Skip; submódulo antigo não corresponde à implantação validada.

## Pendências registradas

- Job diário da Meta: alinhar ao filtro RN-06 da rota (linha orgânica vazia de 07/10 removida por migração 0011; o job pode gravar de novo).
- Produção tem backend próprio (totais divergem do preview): conferência de números é contra os nativos; manter publicação em dia após cada card concluído.
- Setembro Google incompleto (1 dia coberto): backfill só com leitura autorizada ou aguardar histórico.
- Política REAL de destinatários do relatório quinzenal vazia: preencher com e-mails no workshop (DH-07, 22/10); até lá o job fica desativado e a republicação entrega cópia ao autor.

Meta direta no Skip e Google pelo Maestro/Composio preservados. Contrato Meta em `06_notas/contrato-meta.md`. Pendências de marca/concorrência/lead qualificado continuam nos destinos próprios, sem bloquear construção fase 2.
