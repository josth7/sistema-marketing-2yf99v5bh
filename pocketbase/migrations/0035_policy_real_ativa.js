/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0035 — política REAL do relatório quinzenal ATIVA (workshop
 * antecipado 16/10, DH-07 confirmado pelo dono).
 *
 * A 0034 tentou atualizar com filtro vazio e não achou o registro real
 * (tick mostrou politicas=1 — só a fixture). Aqui: busca fixture=false,
 * grava enabled=true + approved_at + destinatários (e-mails; o job resolve
 * e-mail→usuário na entrega).
 */
migrate(
  (app) => {
    const colP = app.findCollectionByNameOrId('report_policy')
    const reais = app.findRecordsByFilter(colP, 'fixture=false', '', 10, 0)
    if (!reais || reais.length === 0) {
      console.log('migração 0035: nenhum registro real em report_policy')
      return
    }
    const emails = ['josth7@icloud.com', 'anezia@haisan.com.br', 'haisan.ecmm@gmail.com']
    for (const p of reais) {
      p.set('enabled', true)
      p.set('approved_at', new Date().toISOString())
      p.set('recipient_user_ids', JSON.stringify(emails))
      p.set(
        'approval_record',
        'DH-07 confirmado pelo dono no workshop antecipado 16/10 — quinzenas 1–15/16–fim, destinatários por e-mail',
      )
      app.save(p)
      console.log('migração 0035: política real ATIVA com ' + emails.length + ' destinatários')
    }
  },
  (app) => {
    console.log('migração 0035 revertida (ativação não é revertida — decisão do dono)')
  },
)
