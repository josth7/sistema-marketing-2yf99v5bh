migrate(
  (app) => {
    var n = 0
    try {
      const colL = app.findCollectionByNameOrId('crm_leads')
      const ls = app.findRecordsByFilter(colL, "telefone='5541998000055'", '', 5, 0)
      for (const l of ls) {
        try {
          const colC = app.findCollectionByNameOrId('conversion_events')
          const cs = app.findRecordsByFilter(colC, "lead_id='" + l.id + "'", '', 10, 0)
          for (const c of cs) {
            try {
              app.delete(c)
              n++
            } catch (a) {}
          }
        } catch (b) {}
        try {
          const colE = app.findCollectionByNameOrId('crm_lead_events')
          const es = app.findRecordsByFilter(colE, "lead_id='" + l.id + "'", '', 50, 0)
          for (const e of es) {
            try {
              app.delete(e)
            } catch (c2) {}
          }
        } catch (d) {}
        try {
          app.delete(l)
          n++
        } catch (e2) {}
      }
    } catch (f) {}
    console.log('0157: removidos=' + n)
  },
  (app) => {
    console.log('0157 revertida')
  },
)
