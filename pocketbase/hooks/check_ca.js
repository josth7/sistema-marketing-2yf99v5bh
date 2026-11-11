/// <reference path="../pb_data/types.d.ts" />
/**
 * CORRIGE O `ultimo_autor` DAS CONVERSAS (11/11).
 *
 * O bug marcava toda mensagem do robô como `equipe_central`. Corrigi o código,
 * mas as conversas antigas ficaram com o valor errado.
 *
 * Aqui se recalcula o `ultimo_autor` de cada conversa em triagem a partir da
 * ÚLTIMA MENSAGEM REAL, e se mostra quantas mudaram.
 *
 * GET /backend/v1/check/corrige-autor
 */
routerAdd(
  'GET',
  '/backend/v1/check/corrige-autor',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, analisadas: 0, corrigidas: 0, por_autor: {}, detalhes: [] }

    var convs = []
    try {
      convs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "estado='triagem'",
        '',
        3000,
        0,
      )
    } catch (e0) {
      return e.json(200, { ok: false, erro: String(e0).slice(0, 120) })
    }

    for (const cv of convs) {
      out.analisadas++
      // a última mensagem real
      var ultima = null
      try {
        const msgs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_mensagens'),
          "conexao='" +
            String(cv.get('conexao')) +
            "' && contato_telefone='" +
            String(cv.get('contato_telefone')) +
            "'",
          '',
          60,
          0,
        )
        for (const m of msgs) {
          const q = String(m.get('created') || '')
          if (!ultima || q > String(ultima.get('created') || '')) ultima = m
        }
      } catch (e1) {}

      if (!ultima) continue

      const dir = String(ultima.get('direcao') || '')
      const autor = String(ultima.get('autor') || '')
      var correto = ''
      if (dir === 'entrada') correto = 'cliente'
      else if (autor === 'ia') correto = 'ia'
      else if (autor === 'vendedor') correto = 'vendedor'
      else correto = 'equipe_central'

      out.por_autor[correto] = (out.por_autor[correto] || 0) + 1

      const atual = String(cv.get('ultimo_autor') || '')
      if (atual !== correto) {
        try {
          cv.set('ultimo_autor', correto)
          app.save(cv)
          out.corrigidas++
          if (out.detalhes.length < 5) {
            out.detalhes.push({
              tel: String(cv.get('contato_telefone') || '').slice(-6),
              de: atual,
              para: correto,
            })
          }
        } catch (e2) {}
      }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
