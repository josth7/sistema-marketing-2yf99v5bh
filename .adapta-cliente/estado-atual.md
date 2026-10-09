# Estado atual — Adapta Cliente

- schema_version: adapta-cliente-state/v2
- task_id: 3b491438-f380-452f-baba-d4e64aa52fca
- champion: José (Josth) — dono do repo josth7
- executor: Mikael
- owner_informativo: nenhuma
- spec: 04_fase-atual/specs/spec-004.md (SPEC-2-004)
- analise: .adapta-cliente/analises/3b491438-relatorio-executivo.md (entregue 09/10 ~17:15 BRT)
- etapa: aguardando_teste_humano
- autorizacao_implementacao: confirmada 09/10 17:13 — "Pode implementar" (Josth)
- teste_humano: pendente — Josth confere /relatorios na PRODUÇÃO (v0.0.69)
- verificacao_automatica: passou — QA Skip 100% (v0.0.66–69); schema de reports conferido (22 campos, UNIQUE, RLS); provas ao vivo: 401 · 422 janela inválida · 422 quinzena em curso · 200 generate 16–30/09 com aviso de cobertura parcial · 409 duplicata · 200 generate sem dados (aviso factual, ausência ≠ zero) · GET lista/detalhe com snapshot/cobertura/eligibility/decisões/alertas · draft substituível sem duplicar (4→4) · tela provada no navegador (login, gerador, prévia-demo com XSS como texto, lista, "Ver prévia")
- aprendizado: capturado — (1) campos json do PB chegam JÁ parseados no SDK (typeof string falha); (2) componente extraído precisa calcular seu próprio estado local (hojeISO) — ReferenceError derruba o React inteiro (tela branca); (3) agrupamento usa objetivo CANÔNICO (espelhar MAPA_OBJETIVO do ingestao.ts, preservando raw); (4) draft pode ser substituído pelo gerador sem duplicar (state!=draft → 409)
- task_anterior: edd618c7 (decisões com revisão obrigatória) — concluída 09/10 17:00 (v0.0.65, ref 1d4b0be)
- ultima_acao: implementação concluída até o portão (v0.0.69 publicada, ref d70ff73, 20:26:36Z); registros gravados
- proxima_acao: teste humano do Josth em /relatorios (produção); após aprovação → concluir-task (fase.md 5/12, STATUS, changelog)
- atualizado_em: 2026-10-09T17:35:00-03:00
