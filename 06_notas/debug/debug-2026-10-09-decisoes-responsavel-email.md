# Debug Summary

**Task e problema:** edd618c7 — teste humano do Josth (2 rodadas): (1) "Registrar decisão" não salvava; (2) pós-correção, e-mail externo no responsável era recusado sem explicar, e campo faltante mostrava erro sem descrever.
**Reprodução (navegador, produção):** submit vazio → 422 do servidor mas a tela mostrava apenas "Something went wrong." e nenhum erro por campo; e-mail externo → 422 sem mensagem na tela.
**Causa raiz (cadeia provada no bundle v0.26 do SDK):**

1. **Responsável por E-MAIL rejeitado (rodada 1)**: validação do POST limitava responsible_user a 30 chars (ID PocketBase) e só buscava por ID — humano digita e-mail (38+) → 422 sem explicação.
2. **Erros invisíveis (rodada 2 — CAUSA PRINCIPAL)**: o SDK lança `ClientResponseError` com o CORPO em `e.response` (`throw new Xm({url, status, data:n})` → constructor: `this.response = t.data`); a página lia `e.response?.data` (formato de validação NATIVA de coleção) → `undefined` → caía em `getErrorMessage(e)` = "Something went wrong." genérico. Nenhum erro por campo nem o `erro` do servidor chegavam à tela.
   **Correção (v0.0.59–v0.0.63):**

- hook: responsible_user aceita **ID ou E-MAIL** (findRecordById → findAuthRecordByEmail), limite 200, mensagem ensina o formato; PATCH idem
- página: `detail = e.response?.data ?? e.response ?? e.data` (cobre nativa e custom); erros por campo renderizam; aviso de topo = `erro` do servidor; sem campos → "Confira os campos destacados abaixo."; getErrorMessage também lê `e.response.erro` antes do message genérico
  **Verificação automática:** QA 100% (v0.0.61/62/63). Revalidação ao vivo na produção (v0.0.63): submit vazio → aviso "entrada inválida" + 4 erros descritos nos campos; e-mail externo (maria@gmail.com) → "responsável não encontrado — digite o E-MAIL do usuário (ex.: anezia@haisan.com.br) ou o ID dele"; e-mail do fixture → **200** + "Decisão registrada".
  **Situação:** aguardando teste humano
