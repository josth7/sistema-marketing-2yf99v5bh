/// <reference path="../pb_data/types.d.ts" />
/**
 * AS 2 CONVERSAS QUE NÃO PAUSARAM (11/11).
 *
 * De 6 conversas com resposta da equipe, 2 ficaram em `triagem`. Preciso saber
 * POR QUE: a resposta veio por um caminho que não pausa, ou há caso de borda?
 *
 * Mostra, para cada uma: quem respondeu, por qual conexão, o que veio antes e
 * depois, e o estado atual.
 *
 * GET /backend/v1/check/nao-pausou
 */
routerAdd(
  'GET',
  '/backend/v1/check/nao-pausou',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, casos: [] }

    var convs = []
    try {
      convs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "estado='triagem' && ultimo_autor='equipe_central'",
        '',
        30,
        0,
      )
    } catch (e0) {
      return e.json(200, { ok: false, erro: String(e0).slice(0, 130) })
    }

    for (const cv of convs) {
      if (out.casos.length >= 6) break
      var cxNome = ''
      var cxPapel = ''
      try {
        const cx = app.findRecordById('whatsapp_conexoes', String(cv.get('conexao')))
        cxNome = String(cx.get('nome_exibicao') || '')
        cxPapel = String(cx.get('papel') || '')
      } catch (e1) {}

      // as últimas mensagens, em ordem
      var msgs = []
      try {
        const lista = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_mensagens'),
          "conexao='" +
            String(cv.get('conexao')) +
            "' && contato_telefone='" +
            String(cv.get('contato_telefone')) +
            "'",
          '',
          40,
          0,
        )
        for (const m of lista) {
          msgs.push({
            q: String(m.get('created') || '').slice(11, 19),
            dir: String(m.get('direcao') || ''),
            autor: String(m.get('autor') || ''),
            texto: String(m.get('texto') || '').slice(0, 40),
          })
        }
        msgs.sort(function (a, b) {
          return a.q < b.q ? -1 : 1
        })
      } catch (e2) {}

      out.casos.push({
        tel: String(cv.get('contato_telefone') || '').slice(-6),
        estado: String(cv.get('estado') || ''),
        ultimo_autor: String(cv.get('ultimo_autor') || ''),
        conexao: cxNome,
        papel: cxPapel,
        ultimas: msgs.slice(-4),
      })
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
