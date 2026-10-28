/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0069 — grants das ações de WhatsApp (SPEC-3-005, CA-3-11).
 *
 * A 0068 tentou criar os grants quando `manage_whatsapp` ainda NÃO existia em
 * ACTIONS_VALIDAS: o valor foi recusado e o grant saiu sem as ações novas.
 * A v0.0.284 acrescentou as três ações à lista; agora o grant é criado de novo.
 *
 * Grant EXTRA (não mexe nos existentes): as rotas percorrem todos os grants e
 * liberam se QUALQUER um tiver a ação, então isto só soma permissão.
 *
 * Idempotente: usuário que já tem as ações é ignorado.
 */
migrate(
  (app) => {
    const colG = app.findCollectionByNameOrId('access_grants')
    const colU = app.findCollectionByNameOrId('users')
    const NOVAS = ['read_conversas', 'manage_whatsapp', 'manage_atendimento']
    const emails = ['josth7@icloud.com', 'anezia@haisan.com.br']
    for (const email of emails) {
      let us = []
      try {
        us = app.findRecordsByFilter(colU, "email='" + email + "'", '', 1, 0)
      } catch (e) {}
      if (!us || us.length === 0) {
        console.log('0069: usuario nao encontrado: ' + email)
        continue
      }
      const uid = us[0].id
      let ja = []
      try {
        ja = app.findRecordsByFilter(colG, "user_id='" + uid + "' && revoked_at=''", '', 60, 0)
      } catch (e2) {}
      let tem = false
      for (const g of ja) {
        let acts = []
        try {
          const raw = g.get('actions')
          if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
            acts = JSON.parse(String.fromCharCode.apply(null, raw))
          } else if (typeof raw === 'string') {
            acts = JSON.parse(raw)
          } else {
            acts = raw || []
          }
        } catch (e3) {}
        if (acts.indexOf('manage_whatsapp') >= 0 && acts.indexOf('read_conversas') >= 0) tem = true
      }
      if (tem) {
        console.log('0069: ' + email + ' ja tem as acoes')
        continue
      }
      try {
        const g = new Record(colG)
        g.set('user_id', uid)
        g.set('actions', NOVAS)
        g.set('scope_accounts', ['*'])
        g.set('scope_channels', ['*'])
        g.set('revoked_at', '')
        app.save(g)
        console.log('0069: grant criado para ' + email)
      } catch (eG) {
        console.log('0069: falha no grant de ' + email + ': ' + eG)
      }
    }
  },
  (app) => {
    console.log('0069 revertida')
  },
)
