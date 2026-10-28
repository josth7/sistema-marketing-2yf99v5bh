/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0077 — `read_conversas` para os usuários de teste (CA-3-24).
 *
 * Sem esta ação a tela Conversas devolve 403 para o usuário de QA e não há
 * como provar a lista nem o tempo real pelo caminho real da rota.
 *
 * Lição do projeto: o grant tem UNIQUE (user_id, role, version) e a rota
 * recusa grant para si — então SOMA a ação ao grant ativo que já existe,
 * nunca cria um novo (as rotas liberam por OR, somar não tira permissão).
 */

migrate(
  (app) => {
    const colG = app.findCollectionByNameOrId('access_grants')
    const colU = app.findCollectionByNameOrId('users')
    var usuarios = []
    try {
      usuarios = app.findRecordsByFilter(colU, '', '', 200, 0)
    } catch (e0) {}

    var vistas = 0
    for (const u of usuarios) {
      const email = String(u.get('email') || '').toLowerCase()
      const nome = String(u.get('name') || '').toLowerCase()
      if (email.indexOf('fixture') < 0 && nome.indexOf('fixture') < 0) continue
      vistas = vistas + 1

      var grants = []
      try {
        grants = app.findRecordsByFilter(
          colG,
          "user_id='" + u.id + "' && revoked_at=''",
          '-created',
          5,
          0,
        )
      } catch (e1) {}
      if (!grants || grants.length === 0) {
        console.log('0077: sem grant ativo para ' + email)
        continue
      }
      const g = grants[0]
      var acts = []
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
      if (!Array.isArray(acts)) acts = []
      if (acts.indexOf('read_conversas') >= 0) continue
      acts.push('read_conversas')
      g.set('actions', acts)
      try {
        app.save(g)
        console.log('0077: read_conversas somado para ' + email)
      } catch (e3) {
        console.log('0077: falhou ' + email + ' -> ' + String(e3).slice(0, 120))
      }
    }
    console.log('0077: usuarios de teste vistos = ' + String(vistas))
  },
  (app) => {
    console.log('0077 revertida')
  },
)
