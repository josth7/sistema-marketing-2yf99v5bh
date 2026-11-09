/// <reference path="../pb_data/types.d.ts" />
/**
 * REPROCESSA OS ÓRFÃOS (09/11) — CA-3-110.
 *
 * Os 6 leads sem dono têm pedido `concluida` criado **antes** da correção que
 * confirma o dono. Como o pedido já existe, o cron não cria outro.
 *
 * **O que esta rota faz:** cria um pedido NOVO para cada órfão, deixando o
 * ponto único gravar o dono com a verificação nova.
 *
 * GET /backend/v1/diag/reprocessa-orfaos
 */
routerAdd(
  'GET',
  '/backend/v1/diag/reprocessa-orfaos',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, orfaos: 0, pedidos: 0, comDono: 0, semDono: 0, detalhes: [] }

    var leads = []
    try {
      leads = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '',
        12000,
        0,
      )
    } catch (e0) {
      return e.json(200, { ok: false, erro: String(e0).slice(0, 140) })
    }

    const orfaos = []
    for (const l of leads) {
      if (String(l.get('owner_id') || '') !== '') continue
      if (String(l.get('status') || '') === 'descartado') continue
      orfaos.push(l)
    }
    out.orfaos = orfaos.length

    const colT = app.findCollectionByNameOrId('whatsapp_transferencias')
    for (const l of orfaos) {
      try {
        const tr = new Record(colT)
        tr.set('lead', l.id)
        tr.set('origem_pedido', 'botao')
        tr.set('motivo', 'primeiro_contato')
        tr.set('simulacao', false)
        tr.set('fixture', false)
        tr.set('detalhe', 'reprocessamento dos orfaos 09/11')
        app.save(tr)
        out.pedidos++
      } catch (e1) {
        out.detalhes.push({ lead: l.id.slice(0, 10), erro: String(e1).slice(0, 80) })
      }
    }

    // confirma um por um
    const nomes = {}
    try {
      for (const u of app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        '',
        '',
        300,
        0,
      )) {
        nomes[u.id] = String(u.get('name') || '')
      }
    } catch (e2) {}

    for (const l of orfaos) {
      var rel = null
      try {
        rel = app.findRecordById('crm_leads', l.id)
      } catch (e3) {}
      const d = rel ? String(rel.get('owner_id') || '') : ''
      if (d !== '') {
        out.comDono++
        out.detalhes.push({
          nome: String(l.get('nome') || '').slice(0, 14),
          dono: nomes[d] || d.slice(0, 8),
        })
      } else {
        out.semDono++
      }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
