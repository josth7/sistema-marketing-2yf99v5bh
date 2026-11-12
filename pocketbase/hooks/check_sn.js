/// <reference path="../pb_data/types.d.ts" />
/**
 * O NUMERO DA SABRINA SERVE PARA O TESTE? (12/11 15:07).
 *
 * 4198903-6170 foi usado no piloto de hoje 11:10 e caiu no numero do FABIO
 * (nao na central), em conversa antiga de 30/10 pausada. Se ele mandar de novo
 * na CENTRAL, o robo so age se a conversa da central estiver em `triagem`.
 *
 * GET /backend/v1/check/sabrina-numero
 */
routerAdd(
  'GET',
  '/backend/v1/check/sabrina-numero',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, conversas: [], podeTestar: false, motivo: '' }

    const TELS = ['554189036170', '4189036170']

    const nomesCx = {}
    const papelCx = {}
    try {
      for (const c of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        '',
        '',
        60,
        0,
      )) {
        nomesCx[c.id] = String(c.get('nome_exibicao') || '')
        papelCx[c.id] = String(c.get('papel') || '')
      }
    } catch (e0) {}

    for (const tel of TELS) {
      try {
        const cvs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_conversas'),
          "contato_telefone='" + tel + "'",
          '',
          10,
          0,
        )
        for (const c of cvs) {
          const cx = String(c.get('conexao') || '')
          out.conversas.push({
            tel: tel,
            conexao: nomesCx[cx] || '',
            papel: papelCx[cx] || '',
            estado: String(c.get('estado') || ''),
            msgs: Number(c.get('total_mensagens') || 0),
            ultimo_autor: String(c.get('ultimo_autor') || ''),
            ultima: String(c.get('ultima_mensagem_em') || c.get('created') || '').slice(0, 16),
          })
        }
      } catch (e1) {}
    }

    // o veredito: existe conversa da CENTRAL em triagem? (e o robo age nela)
    var centralTriagem = null
    for (const c of out.conversas) {
      if (c.papel === 'central' && c.estado === 'triagem') centralTriagem = c
    }
    if (centralTriagem) {
      out.podeTestar = true
      out.motivo = 'ha conversa da central em triagem — o robo age nela'
    } else {
      const daCentral = out.conversas.filter(function (x) {
        return x.papel === 'central'
      })
      if (daCentral.length > 0) {
        out.motivo =
          'a conversa da central esta em "' +
          daCentral[0].estado +
          '" — o robo NAO age; precisa devolver para triagem'
      } else {
        out.podeTestar = true
        out.motivo = 'nao ha conversa na central — o robo vai criar uma nova em triagem'
      }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
