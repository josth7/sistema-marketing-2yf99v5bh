routerAdd(
  'GET',
  '/backend/v1/diag/testa-variaveis',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const col = $app.findCollectionByNameOrId('whatsapp_envios')
    const out = {}
    // T1: so legenda
    try {
      const a = new Record(col)
      a.set('conexao', '')
      a.set('destino_telefone', '5541900000009')
      a.set('motivo', 'teste')
      a.set('modo', 'modelo')
      a.set('modelo_nome', 'x')
      a.set('legenda', 'Maria|Fabio')
      a.set('estado', 'pendente')
      a.set('tentativas', 0)
      a.set('dedupe_key', 'prova-var-1')
      a.set('fixture', true)
      $app.save(a)
      out.com_legenda = 'OK -> legenda=' + String(a.get('legenda'))
      try {
        app.delete(a)
      } catch (x) {}
    } catch (e1) {
      out.com_legenda = 'FALHOU: ' + String(e1).slice(0, 150)
    }
    // T2: legenda + variaveis juntos
    try {
      const b = new Record(col)
      b.set('conexao', '')
      b.set('destino_telefone', '5541900000008')
      b.set('motivo', 'teste')
      b.set('modo', 'modelo')
      b.set('modelo_nome', 'x')
      b.set('legenda', 'Maria|Fabio')
      b.set('variaveis', { 1: 'Maria', 2: 'Fabio' })
      b.set('estado', 'pendente')
      b.set('tentativas', 0)
      b.set('dedupe_key', 'prova-var-2')
      b.set('fixture', true)
      $app.save(b)
      out.com_os_dois = 'OK -> legenda=[' + String(b.get('legenda') || '') + ']'
      try {
        app.delete(b)
      } catch (x) {}
    } catch (e2) {
      out.com_os_dois = 'FALHOU: ' + String(e2).slice(0, 200)
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
