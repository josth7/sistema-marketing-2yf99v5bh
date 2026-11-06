migrate(
  (app) => {
    var n = 0
    try {
      const colC = app.findCollectionByNameOrId('conversion_events')
      const cs = app.findRecordsByFilter(colC, "dedupe_key='conv-prova-capi'", '', 5, 0)
      for (const c of cs) {
        try {
          app.delete(c)
          n++
        } catch (a) {}
      }
    } catch (b) {}
    try {
      const colL = app.findCollectionByNameOrId('crm_leads')
      const ls = app.findRecordsByFilter(colL, "telefone='5541998000066'", '', 5, 0)
      for (const l of ls) {
        try {
          app.delete(l)
          n++
        } catch (c) {}
      }
    } catch (d) {}
    console.log('limpa prova capi: ' + n)
  },
  (app) => {},
)
