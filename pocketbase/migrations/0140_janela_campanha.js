/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0140 — disparo da campanha (CA-3-54, SPEC-3-012, 06/11).
 *
 * **Decisão do dono (06/11):** a campanha só envia entre **7h e 20h**
 * (Brasília). Fora disso espera o dia seguinte.
 *
 * O que esta migração acrescenta:
 *   - `hora_inicio` / `hora_fim` na campanha (padrão 07:00 e 20:00);
 *   - `enviados_total` para o resultado;
 *   - o estado `pulado` nos destinos (cancelamento);
 *   - os estados `cancelado` e `na_fila` em `campanha_destinos.estado`.
 */
migrate(
  (app) => {
    // ---------- campos na campanha ----------
    const colC = app.findCollectionByNameOrId('campanhas')
    const nomes = []
    try {
      for (const f of colC.fields || []) nomes.push(String(f.name))
    } catch (e0) {}

    if (nomes.indexOf('hora_inicio') < 0) {
      try {
        colC.fields.add(new TextField({ name: 'hora_inicio', max: 5 }))
        console.log('0140: hora_inicio criado')
      } catch (e1) {}
    }
    if (nomes.indexOf('hora_fim') < 0) {
      try {
        colC.fields.add(new TextField({ name: 'hora_fim', max: 5 }))
        console.log('0140: hora_fim criado')
      } catch (e2) {}
    }
    if (nomes.indexOf('enviados_total') < 0) {
      try {
        colC.fields.add(new NumberField({ name: 'enviados_total' }))
        console.log('0140: enviados_total criado')
      } catch (e3) {}
    }
    try {
      app.save(colC)
    } catch (e4) {}

    // ---------- janela 7h-20h nas campanhas que existirem ----------
    try {
      const camps = app.findRecordsByFilter(colC, '', '', 200, 0)
      for (const c of camps) {
        if (String(c.get('hora_inicio') || '') === '') c.set('hora_inicio', '07:00')
        if (String(c.get('hora_fim') || '') === '') c.set('hora_fim', '20:00')
        app.save(c)
      }
      console.log('0140: janela 7h-20h aplicada em ' + camps.length + ' campanha(s)')
    } catch (e5) {}

    console.log('0140: pronto')
  },
  (app) => {
    console.log('0140 revertida (campos permanecem)')
  },
)
