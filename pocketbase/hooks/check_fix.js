/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/fix-conv',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const ex = String(e.request.url.query().get('executar') || '') === '1'
    const out = { ok: true, executar: ex, antes: null, depois: null }
    const cvs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conversas'),
      "contato_telefone~'9036170'",
      '',
      10,
      0,
    )
    const nomes = {}
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      '',
      '',
      60,
      0,
    ))
      nomes[c.id] = String(c.get('nome_exibicao') || '')
    var alvo = null
    for (const c of cvs)
      if (String(nomes[String(c.get('conexao') || '')] || '').indexOf('Atendimento') >= 0) alvo = c
    if (!alvo) return e.json(200, { ok: false, erro: 'sem conversa na central' })
    out.antes = {
      estado: String(alvo.get('estado') || ''),
      etapa: String(alvo.get('etapa_atual') || ''),
      autor: String(alvo.get('ultimo_autor') || ''),
      ia: String(alvo.get('ultima_resposta_ia_em') || '').slice(11, 19),
    }
    if (ex) {
      try {
        alvo.set('estado', 'triagem')
        alvo.set('etapa_atual', '')
        alvo.set('pausada_motivo', '')
        alvo.set('pausada_em', '')
        try {
          alvo.set('ultima_resposta_ia_em', '')
        } catch (x) {}
        alvo.set('ultimo_autor', 'cliente')
        app.save(alvo)
        out.depois = {
          estado: String(alvo.get('estado') || ''),
          etapa: String(alvo.get('etapa_atual') || ''),
        }
      } catch (e1) {
        out.erro = String(e1).slice(0, 100)
      }
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
