# AP-2026-10-07-1420 — sintaxe de fields.add em coleção EXISTENTE

- **Task**: b327b4ea (CA-2-01/02) · **Data**: 2026-10-07 14:20 BRT
- **Sinal**: migração 0010 falhou no QA ("could not convert [object Object] to core.Field") ao usar plain objects em `col.fields.add`.
- **Causa**: a regra muda conforme o contexto — `new Collection({ fields: [...] })` usa plain objects, mas `col.fields.add(...)` em coleção EXISTENTE exige construtores tipados (`new TextField({ name: ... })`).
- **Correção**: `col.fields.add(new TextField({ name: 'objective_raw' }))` + `col.fields.getByName()` para checar existência (v0.0.37, QA 100%).
- **Reutilizável**: plain objects só em `new Collection`; em coleção existente, sempre construtores tipados. Checar existência com `getByName` (não `.some`).
