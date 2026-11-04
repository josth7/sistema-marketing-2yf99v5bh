/// <reference path="../pb_data/types.d.ts" />
/**
 * Rota de diagnóstico temporária (04/11) — mostra POR QUE a criação de lead
 * falha na migração. Devolve a mensagem do PocketBase em vez de engolir.
 *
 * GET /backend/v1/diag/lead   (exige autenticação)
 */
routerAdd(
  'GET',
  '/backend/v1/diag/lead',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const colL = $app.findCollectionByNameOrId('crm_leads')
    const out = { tentativas: [] }

    // descobre o id da pessoa de prova
    var pessoaId = ''
    try {
      const a = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('users'),
        "email='suspensao.fixture@haisan.com.br'",
        '',
        1,
        0,
      )
      if (a && a.length > 0) pessoaId = a[0].id
    } catch (e0) {}

    // tentativa 1: só o mínimo
    try {
      const l = new Record(colL)
      l.set('nome', 'Diag Minimo')
      l.set('origem', 'manual')
      $app.save(l)
      out.tentativas.push({ passo: 'minimo', ok: true, id: l.id })
    } catch (err) {
      out.tentativas.push({ passo: 'minimo', ok: false, erro: String(err).slice(0, 400) })
    }

    // tentativa 2: com telefone
    try {
      const l = new Record(colL)
      l.set('nome', 'Diag Telefone')
      l.set('telefone', '5541999000001')
      l.set('origem', 'manual')
      $app.save(l)
      out.tentativas.push({ passo: 'com telefone', ok: true, id: l.id })
    } catch (err) {
      out.tentativas.push({ passo: 'com telefone', ok: false, erro: String(err).slice(0, 400) })
    }

    // tentativa 3: com status
    try {
      const l = new Record(colL)
      l.set('nome', 'Diag Status')
      l.set('telefone', '5541999000002')
      l.set('origem', 'manual')
      l.set('status', 'entrada_lead')
      $app.save(l)
      out.tentativas.push({ passo: 'com status', ok: true, id: l.id })
    } catch (err) {
      out.tentativas.push({ passo: 'com status', ok: false, erro: String(err).slice(0, 400) })
    }

    // tentativa 4: com dono
    try {
      const l = new Record(colL)
      l.set('nome', 'Diag Dono')
      l.set('telefone', '5541999000003')
      l.set('origem', 'manual')
      l.set('status', 'entrada_lead')
      l.set('owner_id', pessoaId)
      $app.save(l)
      out.tentativas.push({ passo: 'com dono', ok: true, id: l.id })
    } catch (err) {
      out.tentativas.push({ passo: 'com dono', ok: false, erro: String(err).slice(0, 400) })
    }

    // tentativa 5: com fixture
    try {
      const l = new Record(colL)
      l.set('nome', 'Diag Fixture')
      l.set('telefone', '5541999000004')
      l.set('origem', 'manual')
      l.set('status', 'entrada_lead')
      l.set('owner_id', pessoaId)
      l.set('fixture', true)
      $app.save(l)
      out.tentativas.push({ passo: 'com fixture', ok: true, id: l.id })
    } catch (err) {
      out.tentativas.push({ passo: 'com fixture', ok: false, erro: String(err).slice(0, 400) })
    }

    out.pessoa_id = pessoaId
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
