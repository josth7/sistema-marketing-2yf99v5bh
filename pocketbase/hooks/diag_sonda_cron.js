/// <reference path="../pb_data/types.d.ts" />
/**
 * SONDA DE CRON (04/11) — registro do cron de teste.
 *
 * Grava a hora a cada minuto numa coleção própria. Se aparecerem linhas, o
 * agendador do projeto está vivo; se não, nenhum cron funciona e é isso que
 * deixa o cliente sem atendimento.
 */
cronAdd('sonda_cron', '* * * * *', () => {
  try {
    const col = $app.findCollectionByNameOrId('diag_cron_sonda')
    const r = new Record(col)
    r.set('job', 'sonda_cron')
    r.set('quando', new Date().toISOString())
    $app.save(r)
  } catch (e) {
    // silencioso de propósito: se falhar aqui, a coleção não existe
  }
})

// leitura da sonda
routerAdd(
  'GET',
  '/backend/v1/diag/sonda-cron',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    var itens = []
    try {
      itens = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('diag_cron_sonda'),
        '',
        '',
        30,
        0,
      )
    } catch (err) {
      return e.json(200, { ok: false, erro: String(err).slice(0, 200), total: 0 })
    }
    const out = []
    for (const r of itens) {
      out.push({
        job: String(r.get('job') || ''),
        quando: String(r.get('quando') || '').slice(0, 19),
        criado: String(r.get('created') || '').slice(0, 19),
      })
    }
    out.sort(function (a, b) {
      return b.criado.localeCompare(a.criado)
    })
    return e.json(200, { ok: true, total: out.length, itens: out.slice(0, 15) })
  },
  $apis.requireAuth(),
)
