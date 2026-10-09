# Aprendizado contínuo — controle

## AP-2026-10-09-1700 — ClientResponseError do SDK v0.26: corpo em e.response, não e.response.data

- **Card**: edd618c7 (decisões) — 2ª rodada de debug, 09/10
- **Sinal reutilizável**: SIM
- **Causa provada no bundle**: o SDK PocketBase v0.26 lança `ClientResponseError` com `throw new Xm({url, status, data:n})` e o constructor faz `this.response = t.response ?? t.data` — ou seja, o **CORPO da resposta fica em `e.response`** (com alias `e.data`). `e.response.data` só existe em validação NATIVA de coleção (formato `{code, message, data:{campo:{code,message}}}`).
- **Sintoma**: página lia `e.response?.data` → undefined → caía na mensagem genérica "Something went wrong." — erros do servidor invisíveis para o usuário (falha silenciosa na tela).
- **Orientação**: em páginas que chamam rotas custom `/backend/v1/`, ler o corpo com `e.response?.data ?? e.response ?? e.data` (cobre nativa e custom); `getErrorMessage` deve checar `e.response.erro` (contrato das rotas custom) antes de usar `e.message`.
- **Complemento (mesma task)**: validação que confere "ID" digitado por humano deve aceitar E-MAIL também (limite de 30 chars rejeitava e-mail de 38+; findAuthRecordByEmail resolve); mensagem de recusa deve ensinar o formato ("digite o E-MAIL do usuário (ex.: ...) ou o ID dele").

## AP-2026-10-02-1758 — fields como construtores tipados em new Collection (reincidente 08/10)

- **Sinal reutilizável**: SIM
- PocketBase descarta silenciosamente o array `fields` quando os campos usam construtores tipados (`new TextField(...)`) dentro de `new Collection({fields:[...]})` — plain objects `{name, type}` são obrigatórios; QA 100% não pega. Conferir schema com get_collection_details após criar coleção. Reincidente no card fc6d0f5a (v0.0.48 → corrigido por migração 0014).

## AP-2026-10-02-1755 — JSVM (goja): sem Intl, sem helpers top-level, hooks em JS puro

- **Sinal reutilizável**: SIM
- `Intl.DateTimeFormat` NÃO existe no JSVM do PocketBase — datas America/Sao_Paulo por aritmética UTC (UTC-3 fixo, amanhã = now+21h). Helpers top-level são invisíveis nos callbacks de rota/evento — lógica inline obrigatória. Hooks são JS puro (sem TS).
