/// <reference path="../pb_data/types.d.ts" />
/**
 * ÚLTIMO ITEM DO PILOTO (11/11) — alguém responde e o robô PARA.
 *
 * O card CA-3-18 pede: "alguém responde pelo app da central e a IA para".
 * A regra é: saída com autor `equipe_central` ou `vendedor` → `pausada_humano`.
 *
 * Aqui se verifica nas conversas REAIS se isso aconteceu, e se as mensagens da
 * IA param depois da resposta humana.
 *
 * GET /backend/v1/check/robo-para
 */
routerAdd(
  'GET',
  '/backend/v1/check/robo-para',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, casos: [], total: 0, comprovados: 0 }

    // conversas que receberam resposta da equipe/vendedor
    var convs = []
    try {
      convs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "ultimo_autor='equipe_central' || ultimo_autor='vendedor'",
        '',
        60,
        0,
      )
    } catch (e0) {
      return e.json(200, { ok: false, erro: String(e0).slice(0, 120) })
    }

    for (const cv of convs) {
      if (out.casos.length >= 6) break
      const estado = String(cv.get('estado') || '')
      const ultimoAutor = String(cv.get('ultimo_autor') || '')

      // o estado reflete a pausa?
      const pausou = estado === 'pausada_humano'

      // a IA falou DEPOIS da última resposta humana?
      var iaDepois = false
      var ultimaHumana = ''
      var ultimaIA = ''
      try {
        const msgs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_mensagens'),
          "conexao='" +
            String(cv.get('conexao')) +
            "' && contato_telefone='" +
            String(cv.get('contato_telefone')) +
            "'",
          '',
          80,
          0,
        )
        for (const m of msgs) {
          const autor = String(m.get('autor') || '')
          const q = String(m.get('created') || '')
          if (autor === 'equipe_central' || autor === 'vendedor') {
            if (q > ultimaHumana) ultimaHumana = q
          }
          if (autor === 'ia') {
            if (q > ultimaIA) ultimaIA = q
          }
        }
        if (ultimaIA !== '' && ultimaHumana !== '' && ultimaIA > ultimaHumana) iaDepois = true
      } catch (e1) {}

      out.total++
      if (pausou && !iaDepois) out.comprovados++

      out.casos.push({
        tel: String(cv.get('contato_telefone') || '').slice(-6),
        estado: estado,
        ultimo_autor: ultimoAutor,
        pausou: pausou,
        ia_falou_depois: iaDepois,
        ok: pausou && !iaDepois,
      })
    }

    out.green = out.total > 0 && out.comprovados === out.total
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
