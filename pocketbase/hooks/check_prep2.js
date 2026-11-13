/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/prep2',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const ex = String(e.request.url.query().get('executar') || '') === '1'
    const out = { ok: true, executar: ex, antes: [], acao: '' }
    // a conversa da CENTRAL desse numero (todas as variacoes)
    const centrais = {}
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='central' && ativo=true && fixture=false",
      '',
      5,
      0,
    ))
      centrais[c.id] = String(c.get('nome_exibicao') || '')
    const cvs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conversas'),
      "contato_telefone~'9036170'",
      '',
      10,
      0,
    )
    for (const cv of cvs) {
      const cx = String(cv.get('conexao') || '')
      const ehCentral = centrais[cx] !== undefined
      out.antes.push({
        papel: ehCentral ? 'central' : 'vendedor',
        estado: String(cv.get('estado') || ''),
        autor: String(cv.get('ultimo_autor') || ''),
        ia: String(cv.get('ultima_resposta_ia_em') || '').slice(0, 16),
      })
      if (ehCentral && String(cv.get('estado') || '') !== 'triagem') {
        try {
          cv.set('estado', 'triagem')
          cv.set('pausada_motivo', '')
          cv.set('pausada_em', '')
          try {
            cv.set('ultima_resposta_ia_em', '')
          } catch (x) {}
          cv.set('ultimo_autor', 'cliente')
          app.save(cv)
          out.acao = 'devolvida para triagem'
        } catch (e1) {
          out.erro = String(e1).slice(0, 90)
        }
      } else if (ehCentral) {
        // ja em triagem: limpa a marca da IA para poder responder de novo
        if (ex) {
          try {
            cv.set('ultima_resposta_ia_em', '')
            cv.set('ultimo_autor', 'cliente')
            app.save(cv)
            out.acao = 'ja em triagem, marca da IA limpa'
          } catch (e2) {}
        }
      }
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
