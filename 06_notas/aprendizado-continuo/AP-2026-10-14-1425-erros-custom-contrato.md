# AP-2026-10-14-1425 — erros de rotas custom com contrato próprio: a página precisa de leitor de erros próprio

- Status: candidato
- Escopo: projeto do cliente
- Task/SPEC: f9a2a3eb (SPEC-2-005, CA-2-12) — debug do teste humano
- Sinal: nas telas com login (padrão /criterios), falhas de permissão/validação das rotas custom `/backend/v1/` apareciam como erro genérico ("Something went wrong") sem o porquê — o criador tentava aprovar e não via "quem criou o rascunho não pode aprová-lo". O leitor de erros herdado lia a chave errada do corpo (`e.response?.data` é formato de validação NATIVA de coleção; as rotas custom devolvem `{ok:false, erro, campos, detalhe}` com o corpo em `e.response` — alias `e.data` — no SDK v0.26).
- Correção (v0.0.111): leitor de erros próprio da página (cobre `erro`, `campos`, `detalhe` e o formato nativo) aplicado a TODAS as chamadas da tela (aprovar, arquivar, salvar, carregar) — não só na ação testada.
- Evidência: prova ao vivo na produção: criador → "Aprovar" → aviso com a frase completa da regra; aprovação de rascunho incompleto lista os campos que faltam. QA 100%.
- Regra reutilizável: página que chama rota custom `/backend/v1/` deve ler o corpo do erro em `e.response` e interpretar o CONTRATO da rota (erro/campos/detalhe) — nunca confiar no leitor genérico do SDK; cobrir todas as ações da tela, não só a testada.
- Quando aplicar: toda tela nova que consome rotas custom com contrato próprio; toda mensagem de 403/422 que precisa chegar explicada ao usuário.
- Quando não aplicar: erros de validação nativa de coleção (formato `{code, message, data:{campo}}`) — lá `e.response.data` é correto.
- Confiança: alta — causa raiz provada por reprodução e correção verificada em produção.
- Privacidade: sem segredo, dado pessoal ou conteúdo bruto.
