/// <reference path="../pb_data/types.d.ts" />
/**
 * OS DOIS TESTES DO PILOTO (11/11).
 *
 * 1. Sabrina 4198903-6170: o robô conduziu até aparecer o contato do Fábio, mas
 *    a SAUDAÇÃO DO FÁBIO não veio (última mensagem 13:28).
 * 2. 41 8436-5165: o robô mandou a saudação E JÁ transferiu — não filtrou a
 *    conversa (não deixou o cliente escolher).
 *
 * Aqui se abrem as duas conversas: mensagens em ordem, estado, envios.
 *
 * GET /backend/v1/check/dois-testes
 */
routerAdd(
  'GET',
  '/backend/v1/check/dois-testes',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, conversas: [] }

    // os telefones (com e sem o 9)
    const ALVOS = ['554184365165', '4184365165', '554189036170', '4189036170']

    for (const tel of ALVOS) {
      var cvs = []
      try {
        cvs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_conversas'),
          "contato_telefone='" + tel + "'",
          '',
          5,
          0,
        )
      } catch (e0) {}
      for (const cv of cvs) {
        var cxNome = ''
        var cxPapel = ''
        try {
          const cx = app.findRecordById('whatsapp_conexoes', String(cv.get('conexao')))
          cxNome = String(cx.get('nome_exibicao') || '')
          cxPapel = String(cx.get('papel') || '')
        } catch (e1) {}

        // mensagens em ordem
        var msgs = []
        try {
          const lista = app.findRecordsByFilter(
            app.findCollectionByNameOrId('whatsapp_mensagens'),
            "conexao='" + String(cv.get('conexao')) + "' && contato_telefone='" + tel + "'",
            '',
            60,
            0,
          )
          for (const m of lista) {
            msgs.push({
              quando: String(m.get('created') || '').slice(11, 19),
              dir: String(m.get('direcao') || ''),
              autor: String(m.get('autor') || ''),
              texto: String(m.get('texto') || '').slice(0, 70),
            })
          }
          msgs.sort(function (a, b) {
            return a.quando < b.quando ? -1 : 1
          })
        } catch (e2) {}

        // envios para esse telefone
        var envios = []
        try {
          const lista = app.findRecordsByFilter(
            app.findCollectionByNameOrId('whatsapp_envios'),
            "destino_telefone='" + tel + "'",
            '',
            30,
            0,
          )
          for (const en of lista) {
            envios.push({
              quando: String(en.get('created') || '').slice(11, 19),
              motivo: String(en.get('motivo') || ''),
              estado: String(en.get('estado') || ''),
              erro: String(en.get('ultimo_erro') || '').slice(0, 40),
              texto: String(en.get('texto') || '').slice(0, 50),
            })
          }
          envios.sort(function (a, b) {
            return a.quando < b.quando ? -1 : 1
          })
        } catch (e3) {}

        out.conversas.push({
          tel: tel,
          nome: String(cv.get('contato_nome') || ''),
          conexao: cxNome,
          papel: cxPapel,
          estado: String(cv.get('estado') || ''),
          ultimo_autor: String(cv.get('ultimo_autor') || ''),
          total: Number(cv.get('total_mensagens') || 0),
          ultima_ia: String(cv.get('ultima_resposta_ia_em') || '').slice(0, 19),
          mensagens: msgs,
          envios: envios,
        })
      }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
