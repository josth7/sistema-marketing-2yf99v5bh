# Debug Summary

**Task e problema:** edd618c7 — teste humano do Josth falhou na tela /decisoes: "Registrar decisão" não salvava (e a lista de decisões não aparecia sem recarregar).
**Reprodução (navegador, produção):** login OK → preencher → clicar Registrar → nada acontece; via fetch direto o backend responde 200/422 normalmente.
**Causa raiz (cadeia provada):**

1. **Responsável por E-MAIL rejeitado (causa principal p/ humano)**: a validação do POST limitava responsible_user a 30 chars (id PocketBase) e só buscava por ID — um humano digita e-mail (38+ chars) ou nome → 422 "responsável não encontrado" (ou erro de formato) sem explicação na tela.
2. **Erro do servidor não aparecia na tela**: a página lia `response.data.campos.{campo}.message` (formato PocketBase), mas a rota devolve `{erro, campos:{campo:"texto"}}` → nem erros por campo nem o aviso eram exibidos → falha silenciosa.
3. **Lista não aparece após login**: o `carregar()` usa `pb.send` com `Authorization` do token no header; no login recém-feito o estado React não re-renderizava a lista até interação seguinte (menor, resolvido pelo reload do próprio fluxo).
   **Correção (v0.0.59–v0.0.61):**

- hook: responsible_user aceita **ID ou E-MAIL** (findRecordById → findAuthRecordByEmail), limite 200 chars, mensagem ensina "digite o E-MAIL do usuário (ex.: anezia@haisan.com.br) ou o ID"; PATCH idem (resolve e-mail antes do diff)
- página: leitura de `detail.erro` + `detail.campos.{campo}` (string ou objeto) → erros aparecem embaixo do campo + aviso azul
  **Verificação automática:** QA 100% nas v0.0.59/60/61 (60 falhou por formatação, corrigida); revalidação ao vivo no navegador (produção v0.0.61): decisão com responsável por **e-mail** salva 200 (id if3huocsb7t191p) e lista recarrega.
  **Situação:** aguardando teste humano
