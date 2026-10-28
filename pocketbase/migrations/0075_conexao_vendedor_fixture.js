/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0075 — conexão fixture para todo vendedor de teste (CA-3-16).
 *
 * Substitui a 0074, que não aplicou. Faz o mínimo, sem nada exótico:
 * varre os usuários, e para cada um de teste cria uma conexão fixture ativa
 * com número próprio, se ainda não houver.
 *
 * Motivo: o rodízio escolhe o vendedor de teste com menos leads em aberto.
 * Se o escolhido não tiver conexão, a transferência para em `sem_numero` e o
 * envio nunca é provado. Com conexão para todos, qualquer escolha envia.
 */

migrate(
  (app) => {
    const colCx = app.findCollectionByNameOrId('whatsapp_conexoes')
    const colU = app.findCollectionByNameOrId('users')

    // central fixture (garante o caminho de aviso ao cliente)
    var centrais = []
    try {
      centrais = app.findRecordsByFilter(colCx, "fixture=true && papel='central'", '', 5, 0)
    } catch (e0) {}
    if (!centrais || centrais.length === 0) {
      const c = new Record(colCx)
      c.set('papel', 'central')
      c.set('numero', '5541977770000')
      c.set('nome_exibicao', 'CENTRAL FIXTURE QA')
      c.set('session_id', 'fixture-central-qa')
      c.set('ativo', true)
      c.set('fixture', true)
      c.set('nome_segredo_chave', 'DAPI_KEY_CENTRAL')
      app.save(c)
      console.log('0075: central fixture criada')
    }

    var usuarios = []
    try {
      usuarios = app.findRecordsByFilter(colU, '', '', 200, 0)
    } catch (e1) {}

    var n = 0
    for (const u of usuarios) {
      const email = String(u.get('email') || '').toLowerCase()
      const nome = String(u.get('name') || '').toLowerCase()
      if (email.indexOf('fixture') < 0 && nome.indexOf('fixture') < 0) continue
      n = n + 1

      var ja = []
      try {
        ja = app.findRecordsByFilter(
          colCx,
          "fixture=true && papel='vendedor' && vendedor_user='" + u.id + "'",
          '',
          1,
          0,
        )
      } catch (e2) {}
      if (ja && ja.length > 0) continue

      const v = new Record(colCx)
      v.set('papel', 'vendedor')
      v.set('numero', '5541970001' + String(10 + n))
      v.set('nome_exibicao', 'Vendedor FIXTURE ' + String(n))
      v.set('vendedor_nome_publico', 'Vendedor Teste ' + String(n))
      v.set('vendedor_user', u.id)
      v.set('session_id', 'fixture-vend-' + String(n))
      v.set('ativo', true)
      v.set('fixture', true)
      v.set('nome_segredo_chave', 'DAPI_KEY_CENTRAL')
      try {
        app.save(v)
        console.log('0075: conexao criada para ' + String(u.get('name') || u.id))
      } catch (eS) {
        console.log('0075: ERRO ' + u.id + ' -> ' + String(eS).slice(0, 160))
      }
    }
    console.log('0075: usuarios de teste encontrados = ' + String(n))
  },
  (app) => {
    const colCx = app.findCollectionByNameOrId('whatsapp_conexoes')
    try {
      const regs = app.findRecordsByFilter(colCx, 'fixture=true', '', 100, 0)
      for (const r of regs) app.delete(r)
    } catch (e) {}
    console.log('0075 revertida')
  },
)
