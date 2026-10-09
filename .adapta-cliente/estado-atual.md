# Estado atual — Adapta Cliente

- schema_version: adapta-cliente-state/v2
- task_id: edd618c7-d381-49bd-9710-224c6b4a358f
- champion: José (Josth) — dono do repo josth7
- executor: Mikael
- owner_informativo: nenhuma
- spec: 04_fase-atual/specs/spec-003.md (SPEC-2-003)
- etapa: aguardando_teste_humano
- autorizacao_implementacao: confirmada 09/10 15:26 — "Pode implementar o edd618c7" (Josth)
- teste_humano: pendente — 1º teste FALHOU (responsável por e-mail rejeitado + erro silencioso) → corrigido v0.0.61; 2º teste trouxe 2 pontos (e-mail externo recusado sem explicar; campo faltante sem descrever erro) → corrigido v0.0.63; Josth reconfere /decisoes na PRODUÇÃO
- verificacao_automatica: passou — QA Skip 100% (v0.0.56/57/59/61/62/63); provas ao vivo 09/10 (v0.0.57): 401, 422×5, 200×3, 409×2, 403, GET idempotente; revalidação v0.0.63: submit vazio → "entrada inválida" + 4 erros por campo descritos; e-mail externo → erro descritivo no campo; e-mail do fixture → 200
- aprendizado: capturado — ClientResponseError do SDK v0.26 carrega o CORPO em e.response (alias e.data), NÃO em e.response.data (isso é só validação NATIVA de coleção); página deve tentar os dois; getErrorMessage deve ler e.response.erro antes do message genérico; validação de "ID" que humano digita deve aceitar e-mail (limite 30 rejeitava e-mail de 38+); Intl.DateTimeFormat não existe no JSVM (goja)
- task_anterior: fc6d0f5a (critérios de alerta) — concluída 08/10 16:57
- ultima_acao: 2ª correção publicada (v0.0.63, ref 388af39) e revalidada no navegador
- proxima_acao: re-teste humano do Josth em /decisoes (produção); após aprovação → concluir-task (fase.md, STATUS 4/12, changelog)
- atualizado_em: 2026-10-09T16:50:00-03:00
