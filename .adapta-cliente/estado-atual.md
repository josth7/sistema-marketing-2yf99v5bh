# Estado atual — Adapta Cliente

- schema_version: adapta-cliente-state/v2
- task_id: f9a2a3eb-427a-4dfc-ade8-e1219d1e0fc8
- executor: Mikael
- owner_informativo: nenhuma
- spec: 04_fase-atual/specs/spec-005.md (SPEC-2-005, CA-2-12)
- analise: .adapta-cliente/analises/f9a2a3eb-perfis-auth.md
- mapa: .adapta-cliente/mapas/sistema-marketing.md (v0.0.105)
- etapa: concluida
- autorizacao_implementacao: confirmada 14/10 13:26 — "pode implementar" (Josth)
- teste_humano: aprovado 14/10 14:18 — "deu certo" (Josth), após debug dos erros genéricos (v0.0.111)
- verificacao_automatica: passou — QA Skip 100% (v0.0.106–v0.0.111); provas ao vivo CA-2-12:
  401 sem token (acessos/decisions/inbox) · /me dos fixtures com actions corretas (parse char-codes do JSVM — json gravado como string volta como array de códigos) · 403 sem manage_access (criador lista/cria grant) · 200 com manage_access (aprovador lista 2 grants) · criação de grant 200 (v2/v3) + 422 sem actions + 422 action inválida + 409 revogar 2x + 404 inexistente · revogação imediata: sem grant → 403 ao criar draft · restaurado grant de teste do criador (v2) · regressão: criador cria draft 200, criador não aprova a si mesmo 403, aprovador aprova critério completo 200, decisões 200, ping 200, debug-policy removida (404), relatórios 200, caixa 200
- debug_teste_humano: 1 rodada 14/10 — falhas de permissão apareciam como erro genérico sem explicação (o leitor de erros da página lia o campo errado do corpo da resposta); corrigido v0.0.111 com leitor de erros próprio (lê erro, campos e detalhe do contrato /backend/v1) e provado ao vivo: criador tentando aprovar vê "quem criou o rascunho não pode aprová-lo — aprovação é de outro responsável"; aprovação incompleta lista os campos que faltam
- aprendizado: gravado — AP-2026-10-14-1425-erros-custom-contrato (06_notas/aprendizado-continuo/)
- sistema: 07-sistemas/sistema-marketing
- skip_projeto: 61465
- skip_versao: v0.0.111 (d87d693), publicada 2026-10-14
- skip_publicacao: publicada:d87d693 em 2026-10-14
- pendente_github: nao
- decisao_cliente: (1) grants de TESTE para fixtures: SIM (14/10); (2) papel real do dono: só no 5b1de184
- ultima_acao: task CONCLUÍDA — fechamento registrado, GitHub a sincronizar neste commit
- proxima_acao: próxima task exige novo pedido do dono (elegíveis: 5b1de184 perfis/permissões com matriz aprovada; b1200b57 workshop !22/10)
- atualizado_em: 2026-10-14T14:25:00-03:00
