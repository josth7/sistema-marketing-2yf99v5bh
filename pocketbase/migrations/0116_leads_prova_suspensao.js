/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0116 — recria os leads de prova da suspensão (04/11).
 *
 * A 0115 gravava `origem='teste_suspensao'`, que NÃO existe no select de
 * `crm_leads` (valores: meta, google, site, whatsapp, manual, importacao,
 * organico). O PocketBase recusou os 5 inserts e o `try/catch` de cada um
 * engoliu o erro: a pessoa foi criada, os leads não.
 *
 * Aqui uso `origem='manual'` (valor válido) e gravo os 5 leads na carteira da
 * pessoa de prova, todos `fixture=true` para não contaminar número nenhum.
 */
migrate(
  (app) => {
    const colU = app.findCollectionByNameOrId('users')
    const colL = app.findCollectionByNameOrId('crm_leads')
    const EMAIL = 'suspensao.fixture@haisan.com.br'

    var pessoa = null
    try {
      const a = app.findRecordsByFilter(colU, "email='" + EMAIL + "'", '', 1, 0)
      if (a && a.length > 0) pessoa = a[0]
    } catch (e0) {}
    if (!pessoa) {
      console.log('0116: pessoa de prova nao existe — nada a fazer')
      return
    }

    var criados = 0
    for (var i = 1; i <= 5; i++) {
      const tel = '554190000' + (1000 + i)
      var existe = null
      try {
        const a = app.findRecordsByFilter(colL, "telefone='" + tel + "'", '', 1, 0)
        if (a && a.length > 0) existe = a[0]
      } catch (e1) {}
      if (existe) continue
      try {
        const l = new Record(colL)
        l.set('nome', 'Prova Suspensao ' + i)
        l.set('telefone', tel)
        l.set('status', 'entrada_lead')
        l.set('origem', 'manual')
        l.set('owner_id', pessoa.id)
        l.set('vendedor_nome', String(pessoa.get('name') || ''))
        l.set('fixture', true)
        app.save(l)
        criados++
      } catch (e2) {
        console.log('0116: lead ' + i + ' falhou -> ' + String(e2).slice(0, 220))
      }
    }
    console.log('0116: leads de prova criados=' + criados)
  },
  (app) => {
    console.log('0116 revertida')
  },
)
