/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0052 — política real de relatório: destinatários por E-MAIL (os IDs
 * gravados por builds anteriores morreram nos rebuilds da instância; a entrega
 * resolve e-mail→usuário na hora, como já faz a fixture).
 */
migrate(
  (app) => {
    const colP = app.findCollectionByNameOrId('report_policy')
    const politicas = app.findRecordsByFilter(colP, 'fixture=false', '', 10, 0)
    const emails = ['josth7@icloud.com', 'anezia@haisan.com.br', 'haisan.ecmm@gmail.com']
    for (const p of politicas) {
      p.set('recipient_user_ids', JSON.stringify(emails))
      if (!p.get('approved_at')) p.set('approved_at', new Date().toISOString())
      p.set('enabled', true)
      app.save(p)
      console.log('migração 0052: política real com destinatários por e-mail')
    }
  },
  (app) => {
    console.log('migração 0052 revertida: destinatários permanecem')
  },
)
