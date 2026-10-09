# Estado atual — Adapta Cliente

- schema_version: adapta-cliente-state/v2
- task_id: edd618c7-d381-49bd-9710-224c6b4a358f
- champion: José (Josth) — dono do repo josth7
- executor: Mikael
- owner_informativo: nenhuma
- spec: 04_fase-atual/specs/spec-003.md (SPEC-2-003)
- analise: entregue (09/10 ~13:40 BRT)
- etapa: aguardando_teste_humano
- autorizacao_implementacao: confirmada 09/10 15:26 — "Pode implementar o edd618c7" (Josth)
- teste_humano: pendente — 1º teste FALHOU (responsável por e-mail rejeitado + erro silencioso); corrigido em v0.0.61; Josth reconfere /decisoes na PRODUÇÃO
- verificacao_automatica: passou — QA Skip 100% (v0.0.56/57/59/61); provas ao vivo 09/10: 401, 422×5 (sem data/data ontem/data hoje/agendamento passado/fechar sem resultado), 200×3 (criação/PATCH/fechamento com histórico antes-depois), 409×2, 403 alerta fora do escopo, GET idempotente; revalidação: decisão com responsável por E-MAIL salva 200 (if3huocsb7t191p)
- aprendizado: capturado — Intl.DateTimeFormat NÃO existe no JSVM (goja) → datas por aritmética UTC; helpers top-level invisíveis nos callbacks (inline); hooks JS puro; **validação de "ID" que humano digita deve aceitar e-mail** (limite 30 chars rejeitava e-mail de 38+); erros do servidor precisam do formato que a página lê (detail.erro + campos string)
- task_anterior: fc6d0f5a (critérios de alerta) — concluída 08/10 16:57
- ultima_acao: debug concluído (v0.0.61 publicada, ref dae34c5) — revalidação no navegador OK
- proxima_acao: re-teste humano do Josth em /decisoes (produção); após aprovação → concluir-task (fase.md, STATUS 4/12, changelog)
- atualizado_em: 2026-10-09T16:25:00-03:00
