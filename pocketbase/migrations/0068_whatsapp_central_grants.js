/// <reference path="../pb_data/types.d.ts" />
/**
 * Migracao 0068 - numero central da Haisan + acoes novas de WhatsApp.
 *
 * 1) Cadastra a conexao do numero central (+55 41 3035-9361), conectado na
 *    D-API em 27/10. Guarda so o NOME do segredo da chave (DAPI_KEY_CENTRAL),
 *    nunca a chave.
 * 2) Cria grants ADICIONAIS com as tres acoes novas (read_conversas,
 *    manage_whatsapp, manage_atendimento) para direcao e gerencia. Grant extra
 *    e seguro: as rotas percorrem todos os grants e liberam se QUALQUER um tiver
 *    a acao (OR), entao nada do que ja existe e afetado.
 *
 * Idempotente: nao duplica conexao nem grant.
 */
migrate(
  (app) => {
    // ---------- 1. conexao central ----------
    const colC = app.findCollectionByNameOrId('whatsapp_conexoes')
    const SESSION = 'cloud-d4d6e623-517c-4d45-b06f-b3fdbab392c7'
    const NUMERO = '554130359361'
    let existe = []
    try {
      existe = app.findRecordsByFilter(colC, "session_id='" + SESSION + "'", '', 1, 0)
    } catch (e) {}
    if (!existe || existe.length === 0) {
      const rec = new Record(colC)
      rec.set('papel', 'central')
      rec.set('numero', NUMERO)
      rec.set('nome_exibicao', 'Atendimento Haisan')
      rec.set('vendedor_user', '')
      rec.set('vendedor_nome_publico', 'Haisan')
      rec.set('session_id', SESSION)
      rec.set('ativo', true)
      rec.set('nome_segredo_chave', 'DAPI_KEY_CENTRAL')
      rec.set('guardar_historico', true)
      rec.set('recusas_token', 0)
      rec.set('fixture', false)
      try {
        app.save(rec)
        console.log('0068: conexao central criada')
      } catch (eC) {
        console.log('0068: falha ao criar conexao: ' + eC)
      }
    } else {
      console.log('0068: conexao central ja existia')
    }

    // ---------- 2. grants das acoes novas ----------
    const colG = app.findCollectionByNameOrId('access_grants')
    const colU = app.findCollectionByNameOrId('users')
    const NOVAS = ['read_conversas', 'manage_whatsapp', 'manage_atendimento']
    const emails = ['josth7@icloud.com', 'anezia@haisan.com.br']
    for (const email of emails) {
      let us = []
      try {
        us = app.findRecordsByFilter(colU, "email='" + email + "'", '', 1, 0)
      } catch (e) {}
      if (!us || us.length === 0) continue
      const uid = us[0].id
      // ja existe grant com manage_whatsapp? entao nao faz nada
      let ja = []
      try {
        ja = app.findRecordsByFilter(colG, "user_id='" + uid + "' && revoked_at=''", '', 50, 0)
      } catch (e) {}
      let temTodas = false
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
        } catch (e2) {}
        if (acts.indexOf('manage_whatsapp') >= 0 && acts.indexOf('read_conversas') >= 0)
          temTodas = true
      }
      if (temTodas) {
        console.log('0068: ' + email + ' ja tem as acoes')
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
        console.log('0068: grant novo para ' + email)
      } catch (eG) {
        console.log('0068: falha no grant de ' + email + ': ' + eG)
      }
    }
  },
  (app) => {
    console.log('0068 revertida (dados mantidos)')
  },
)
