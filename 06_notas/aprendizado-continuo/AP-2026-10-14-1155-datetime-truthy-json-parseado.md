# AP-2026-10-14-1155 — DateTime zerado do PocketBase é truthy no JSVM e json já vem parseado no SDK v0.26

- Status: candidato
- Escopo: projeto do cliente
- Task/SPEC: a70d5ab8 (SPEC-2-004, CA-2-11)
- Sinal: dois padrões de falha silenciosa no runtime PocketBase do Skip, ambos provados com causa raiz no debug do card a70d5ab8: (1) campo `date` nunca gravado volta de `rec.get()` como DateTime zerado que em JSVM é STRING VAZIA truthy — um teste `if (campo || ...)` entra no ramo "preenchido" sem nunca gravar (bug do "marcar como lida", corrigido v0.0.92 comparando como string); (2) o SDK PocketBase v0.26 no FRONTEND devolve campos `json` como OBJETO já parseado — `JSON.parse(objeto)` lança e o parse seguro degradava tudo para o padrão/fixture (prévia do relatório, corrigido v0.0.98 com parseJson aceitando objeto ou string).
- Evidência: PATCH /backend/v1/inbox/{id}/read respondia 200 com read_at:"" e ja_lida:true na 1ª chamada (prova backend interno 13/10); TypeError "n.map is not a function" capturado no console do navegador ao abrir a prévia (prova 13/10 18:15); correções v0.0.92 e v0.0.98 com QA 100%.
- Regra reutilizável: em hooks JSVM, teste campo date com `String(campo || '') !== ''` (nunca truthy direto); no frontend, parse seguro de campo json aceita `typeof === 'object'` antes de JSON.parse.
- Quando aplicar: qualquer hook que leia/compare campo date de coleção PocketBase e qualquer página que leia campo json via SDK.
- Quando não aplicar: campos date gravados com valor garantido na criação, ou json lido no backend JSVM (que devolve objeto direto).
- Confiança: alta — causa raiz provada por reprodução e correção verificada em produção.
- Privacidade: sem segredo, dado pessoal ou conteúdo bruto.
