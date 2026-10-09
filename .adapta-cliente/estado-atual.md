# Estado atual — Adapta Cliente

- schema_version: adapta-cliente-state/v2
- task_id: edd618c7-d381-49bd-9710-224c6b4a358f
- champion: José (Josth) — dono do repo josth7
- executor: Mikael
- owner_informativo: nenhuma
- spec: 04_fase-atual/specs/spec-003.md (SPEC-2-003)
- etapa: concluida
- autorizacao_implementacao: confirmada 09/10 15:26 — "Pode implementar o edd618c7" (Josth)
- teste_humano: APROVADO — "Testei e funcionou — pode concluir o card" (Josth, 09/10 16:59, após 2 rodadas de debug; 3º re-teste)
- verificacao_automatica: passou — QA Skip 100% (v0.0.56/57/59/61/62/63/64); provas ao vivo (v0.0.57): 401, 422×5, 200×3, 409×2, 403, GET idempotente; revalidações na produção (v0.0.63): submit vazio → "entrada inválida" + 4 erros por campo; e-mail externo → recusa explicada; e-mail fixture → 200; versão no ar = testada (v0.0.64, ref 3736415, publicada 19:41:43Z)
- aprendizado: capturado — ClientResponseError do SDK v0.26 carrega o CORPO em e.response (alias e.data), NÃO em e.response.data (só validação NATIVA); página cobre os dois formatos; getErrorMessage lê e.response.erro antes do message genérico; validação de "ID" que humano digita deve aceitar e-mail (limite 30 rejeitava e-mail de 38+); Intl.DateTimeFormat não existe no JSVM (goja); helpers top-level invisíveis nos callbacks
- task_anterior: fc6d0f5a (critérios de alerta) — concluída 08/10 16:57
- conclusao: fase.md marcada [x] com done:2026-10-09; STATUS 4/12 = 33%; changelog com bloco de conclusão; evidências em 05_entregas/spec-2-003/testes.md; debug em 06_notas/debug/debug-2026-10-09-decisoes-responsavel-email.md
- ultima_acao: fechamento do card (fase/STATUS/changelog/estado gravados; envio ao GitHub em andamento)
- proxima_acao: nenhuma task aberta por este fechamento — próxima task da esteira exige novo pedido do Josth (elegíveis: 3b491438 template de relatório, f9a2a3eb perfis, b1200b57 workshop !22/10, f7591165 alertas !27/10, a434ca96 lembrete !29/10)
- atualizado_em: 2026-10-09T17:05:00-03:00
