/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0151 — dias da semana e intervalo entre campanhas (CA-3-85, 06/11).
 *
 * **Dois campos que faltavam para o disparo respeitar a regra:**
 *   - `dias`: em que dias da semana a campanha pode enviar (padrão seg–sáb).
 *     Sem isso o cron disparava domingo.
 *   - `intervalo_dias`: quantos dias um telefone fica fora de nova campanha
 *     (padrão 7). Sem isso o mesmo cliente recebia toda semana.
 *
 * `inicio_em` já existe (migração 0137).
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('campanhas')
    const nomes = []
    try {
      for (const f of col.fields || []) nomes.push(String(f.name))
    } catch (e0) {}

    if (nomes.indexOf('dias') < 0) {
      try {
        col.fields.add(new TextField({ name: 'dias', max: 100 }))
        console.log('0151: dias criado')
      } catch (e1) {}
    }
    if (nomes.indexOf('intervalo_dias') < 0) {
      try {
        col.fields.add(new NumberField({ name: 'intervalo_dias' }))
        console.log('0151: intervalo_dias criado')
      } catch (e2) {}
    }
    try {
      app.save(col)
    } catch (e3) {}

    // padrões nas campanhas existentes
    try {
      const camps = app.findRecordsByFilter(col, '', '', 200, 0)
      var postos = 0
      for (const c of camps) {
        var mexeu = false
        if (String(c.get('dias') || '') === '') {
          c.set('dias', '["1","2","3","4","5","6"]')
          mexeu = true
        }
        if (Number(c.get('intervalo_dias') || 0) <= 0) {
          c.set('intervalo_dias', 7)
          mexeu = true
        }
        if (mexeu) {
          app.save(c)
          postos++
        }
      }
      console.log('0151: padroes aplicados em ' + postos + ' campanha(s)')
    } catch (e4) {}

    console.log('0151: pronto')
  },
  (app) => {
    console.log('0151 revertida (campos permanecem)')
  },
)
