# AP-2026-10-08-1410 — construtores tipados em new Collection (REINCIDÊNCIA da AP-2026-10-02-1758)

- **Sintoma (provas ao vivo, 08/10)**: POST em alert-criteria retornava draft "ok", mas approve lia `state=null` (409 "estado null") e filtro por uuid dava 400 "Something went wrong".
- **Causa raiz**: migração 0012 usou construtores tipados (`new TextField(...)`) dentro de `new Collection({fields: [...]})` — o PocketBase descarta o array de fields silenciosamente e cria a coleção SEM as colunas. Exatamente o mesmo erro da migração 0004 (02/10), já documentado na AP-2026-10-02-1758.
- **Correção**: migração 0014 recriou a coleção com plain objects (`{name, type}`) — a sintaxe correta para `new Collection`.
- **Orientação reutilizável**: `new Collection` aceita SOMENTE plain objects em `fields`/`indexes`; construtores tipados (`new TextField` etc.) são apenas para `col.fields.add` em coleção EXISTENTE. Ao criar coleção em migração, conferir o schema logo depois com `skip_cloud_get_collection_details` (ou primeiro POST de prova) — QA 100% NÃO pega esse erro, porque o build não valida o shape das coleções.
