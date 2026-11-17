/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/limpa-teste-item2',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, apagados: { leads: 0, transf: 0, precisa: 0 } }
    // lead e transferencia de teste
    for (const l of app.findRecordsByFilter(
      app.findCollectionByNameOrId('crm_leads'),
      "nome~'TESTE ITEM2'",
      '',
      10,
      0,
    )) {
      try {
        for (const t of app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_transferencias'),
          "lead='" + l.id + "'",
          '',
          10,
          0,
        )) {
          try {
            app.delete(t)
            out.apagados.transf++
          } catch (e1) {}
        }
        app.delete(l)
        out.apagados.leads++
      } catch (e2) {}
    }
    // precisa_acao orfaos desse telefone
    for (const p of app.findRecordsByFilter(
      app.findCollectionByNameOrId('precisa_acao'),
      "motivo~'nao atende'",
      '',
      20,
      0,
    )) {
      try {
        app.delete(p)
        out.apagados.precisa++
      } catch (e3) {}
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
