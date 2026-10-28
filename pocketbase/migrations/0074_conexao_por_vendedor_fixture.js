/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0074 — conexão fixture para CADA vendedor de teste (CA-3-16).
 *
 * Por que existe: o rodízio escolhe o vendedor com menos leads em aberto. No
 * caminho fixture ele só considera usuários de teste, e a escolha entre eles
 * varia conforme a carga. Se só um deles tiver conexão, o teste cai em
 * `sem_numero` dependendo de quem for sorteado — e o envio nunca é provado.
 *
 * Esta migração dá a cada vendedor de teste uma conexão fixture ativa, com
 * número próprio. Assim qualquer escolha do rodízio tem número para receber.
 *
 * Também garante a central fixture (a real nunca é usada por teste).
 */

migrate(
  (app) => {
    const colCx = app.findCollectionByNameOrId('whatsapp_conexoes')
    const colU = app.findCollectionByNameOrId('users')

    // ---------- central fixture ----------
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
      c.set('guardar_historico', false)
      // sem modelo aprovado: deixa o caminho `fora_da_janela_sem_modelo` testável
      c.set('modelo_aviso_vendedor', '')
      c.set('modelo_transferencia_cliente', '')
      app.save(c)
      console.log('0074: central fixture criada')
    }

    // ---------- uma conexão de vendedor por usuário de teste ----------
    var usuarios = []
    try {
      usuarios = app.findRecordsByFilter(colU, '', '', 200, 0)
    } catch (e1) {}

    var indice = 0
    for (const u of usuarios) {
      const email = String(u.get('email') || '').toLowerCase()
      const nome = String(u.get('name') || '').toLowerCase()
      if (email.indexOf('fixture') < 0 && nome.indexOf('fixture') < 0) continue
      indice++

      var existentes = []
      try {
        existentes = app.findRecordsByFilter(
          colCx,
          "fixture=true && papel='vendedor' && vendedor_user='" + u.id + "'",
          '',
          1,
          0,
        )
      } catch (e2) {}
      if (existentes && existentes.length > 0) continue

      const v = new Record(colCx)
      v.set('papel', 'vendedor')
      // número único por vendedor de teste (5541 9 7000 100N)
      v.set('numero', '554197000' + String(1000 + indice))
      v.set('nome_exibicao', 'Vendedor FIXTURE ' + String(indice))
      v.set('vendedor_nome_publico', 'Vendedor Teste ' + String(indice))
      v.set('vendedor_user', u.id)
      v.set('session_id', 'fixture-vend-' + u.id.slice(0, 8))
      v.set('ativo', true)
      v.set('fixture', true)
      v.set('nome_segredo_chave', 'DAPI_KEY_CENTRAL')
      v.set('guardar_historico', false)
      try {
        app.save(v)
        console.log('0074: conexao fixture para ' + String(u.get('name') || u.id))
      } catch (eS) {
        console.log('0074: falhou para ' + u.id + ' -> ' + String(eS).slice(0, 120))
      }
    }
    console.log('0074: vendedores de teste vistos = ' + indice)
  },
  (app) => {
    const colCx = app.findCollectionByNameOrId('whatsapp_conexoes')
    try {
      const regs = app.findRecordsByFilter(colCx, 'fixture=true', '', 100, 0)
      for (const r of regs) app.delete(r)
    } catch (e) {}
    console.log('0074 revertida')
  },
)
