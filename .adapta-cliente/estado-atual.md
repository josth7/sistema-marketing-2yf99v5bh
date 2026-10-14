# Estado atual — Adapta Cliente

- schema_version: adapta-cliente-state/v2
- task_id: f9a2a3eb-427a-4dfc-ade8-e1219d1e0fc8
- executor: Mikael
- owner_informativo: nenhuma
- spec: 04_fase-atual/specs/spec-005.md (SPEC-2-005, CA-2-12)
- analise: .adapta-cliente/analises/f9a2a3eb-perfis-auth.md
- mapa: .adapta-cliente/mapas/sistema-marketing.md (v0.0.105)
- etapa: aguardando_teste_humano
- autorizacao_implementacao: confirmada 14/10 13:26 — "pode implementar" (Josth)
- teste_humano: pendente
- verificacao_automatica: passou — QA Skip 100% (v0.0.106–v0.0.109); provas ao vivo CA-2-12:
  401 sem token (acessos/decisions/inbox) · /me dos fixtures com actions corretas (parse char-codes do JSVM — json gravado como string volta como array de códigos) · 403 sem manage_access (criador lista/cria grant) · 200 com manage_access (aprovador lista 2 grants) · criação de grant 200 (v2/v3) + 422 sem actions + 422 action inválida + 409 revogar 2x + 404 inexistente · revogação imediata: sem grant → 403 ao criar draft · restaurado grant de teste do criador (v2) · regressão: criador cria draft 200, criador não aprova a si mesmo 403, aprovador aprova critério completo 200, decisões 200, ping 200, debug-policy removida (404), relatórios 200, caixa 200
- aprendizado: pendente (fechamento)
- sistema: 07-sistemas/sistema-marketing
- skip_projeto: 61465
- skip_versao: v0.0.109 (c99cd60), publicada 2026-10-14T16:36:45Z
- skip_publicacao: publicada:c99cd60 em 2026-10-14T16:36:45Z
- pendente_github: sim (estado + análise + mapa + hooks/migrações alterados — 1 commit)
- decisao_cliente: (1) grants de TESTE para fixtures: SIM (14/10); (2) papel real do dono: só no 5b1de184
- ultima_acao: implementação completa e provada; aguardando teste humano
- proxima_acao: Josth testa (roteiro de teste humano) → aprovado → concluir-task
- atualizado_em: 2026-10-14T13:40:00-03:00
