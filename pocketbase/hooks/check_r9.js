/// <reference path="../pb_data/types.d.ts" />
/**
 * REVISÃO DAS 9 EM TRIAGEM (12/11).
 *
 * Depois da limpeza sobraram 9 conversas em triagem na central. Aqui se abre
 * uma por uma: o que o cliente disse, se o robô respondeu, e por que a conversa
 * continua em triagem.
 *
 * GET /backend/v1/check/revisa-9
 */
routerAdd(
  'GET',
  '/backend/v1/check/revisa-9',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, casos: [] }

    var central = null
    try {
      const cs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='central' && ativo=true && fixture=false",
        '',
        1,
        0,
      )
      if (cs.length > 0) central = cs[0]
    } catch (e0) {}
    if (!central) return e.json(200, { ok: false, erro: 'sem central' })

    // config da empresa da central
    const empCentral = String(central.get('empresa') || '')
    var cfg = null
    try {
      const vs = app.findRecordsByFilter(
        'atendimento_config',
        "empresa='" + empCentral + "'",
        '',
        200,
        0,
      )
      var maior = -1
      for (const v of vs) {
        const n = Number(v.get('versao') || 0)
        if (n > maior) {
          maior = n
          cfg = v
        }
      }
    } catch (e1) {}
    const janela = cfg ? Number(cfg.get('janela_min') || 720) : 720
    out.config = {
      versao: cfg ? Number(cfg.get('versao') || 0) : 0,
      ligado: cfg ? cfg.get('ligado') === true : false,
      janela_min: janela,
    }

    var cvs = []
    try {
      cvs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "conexao='" + central.id + "' && estado='triagem'",
        '',
        100,
        0,
      )
    } catch (e2) {}

    const agora = new Date().getTime()

    for (const c of cvs) {
      const tel = String(c.get('contato_telefone') || '')
      const q = new Date(String(c.get('ultima_mensagem_em') || c.get('created') || '')).getTime()
      const horas = q > 0 ? (agora - q) / 3600000 : 9999

      // as últimas mensagens
      var msgs = []
      try {
        const lista = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_mensagens'),
          "conexao='" + central.id + "' && contato_telefone='" + tel + "'",
          '',
          40,
          0,
        )
        for (const m of lista) {
          msgs.push({
            q: String(m.get('created') || '').slice(11, 19),
            dir: String(m.get('direcao') || ''),
            autor: String(m.get('autor') || ''),
            status: String(m.get('status') || ''),
            texto: String(m.get('texto') || '').slice(0, 55),
          })
        }
        msgs.sort(function (a, b) {
          return a.q < b.q ? -1 : 1
        })
      } catch (e3) {}

      // a IA respondeu depois da última mensagem do cliente?
      var ultimaCliente = ''
      var ultimaIA = ''
      for (const m of msgs) {
        if (m.dir === 'entrada') ultimaCliente = m.q
        if (m.autor === 'ia') ultimaIA = m.q
      }

      var situacao = ''
      if (horas * 60 > janela) situacao = 'fora da janela (' + janela + 'min)'
      else if (ultimaIA !== '' && ultimaIA > ultimaCliente) situacao = 'robo ja respondeu'
      else if (String(c.get('ultimo_autor') || '') !== 'cliente')
        situacao = 'ultima nao e do cliente'
      else situacao = 'DEVERIA responder agora'

      out.casos.push({
        tel: tel.slice(-6),
        nome: String(c.get('contato_nome') || '').slice(0, 20),
        horas: Math.round(horas),
        msgs: Number(c.get('total_mensagens') || 0),
        ultimo_autor: String(c.get('ultimo_autor') || ''),
        ultima_ia: String(c.get('ultima_resposta_ia_em') || '').slice(0, 16),
        situacao: situacao,
        ultimas: msgs.slice(-3),
      })
    }

    out.total = out.casos.length
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
