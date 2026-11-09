routerAdd(
  'GET',
  '/backend/v1/diag/cria-apres-teste',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    // cria um envio igual ao do cron, com legenda, e ve se ela persiste
    const col = $app.findCollectionByNameOrId('whatsapp_envios')
    const env = new Record(col)
    env.set('lead', 'assgh6mhg2') // lead real "Educação física"
    env.set('conexao', 'vdlcwoe5zd96h9h')
    env.set('destino_telefone', '5541900000077')
    env.set('motivo', 'teste')
    env.set('modo', 'modelo')
    env.set('modelo_nome', 'prova')
    env.set('legenda', 'Maria|Fabio')
    env.set('variaveis', { 1: 'Maria', 2: 'Fabio' })
    env.set('estado', 'pendente')
    env.set('tentativas', 0)
    env.set('dedupe_key', 'prova-leg-' + String(Date.now()))
    env.set('fixture', true)
    try {
      $app.save(env)
    } catch (x) {
      return e.json(200, { ok: false, erro: String(x).slice(0, 200) })
    }
    // rele
    var dep = null
    try {
      dep = $app.findRecordById('whatsapp_envios', env.id)
    } catch (x) {}
    return e.json(200, {
      ok: true,
      id: env.id,
      legenda_salva: String(dep ? dep.get('legenda') : ''),
      variaveis_salvas: String(dep ? JSON.stringify(dep.get('variaveis')) : ''),
    })
  },
  $apis.requireAuth(),
)
