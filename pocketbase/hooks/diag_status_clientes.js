/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO TEMPORÁRIO (04/11) — por que a Meta marca `failed`.
 *
 * Os envios de 04/11 para CLIENTES também ficaram `failed`? Se sim, não é a
 * janela de 24h (o cliente acabou de escrever) e o bloqueio é outro.
 *
 * Aqui: pega os chats da sessão central e lê o status REAL de cada mensagem
 * enviada por nós nos números que receberam `ia_resposta` hoje.
 *
 * GET /backend/v1/diag/status-clientes
 */
routerAdd(
  'GET',
  '/backend/v1/diag/status-clientes',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const out = { sessao: '', chats_encontrados: [], resultados: [], erro: '' }
    const sessao = 'cloud-d4d6e623-517c-4d45-b06f-b3fdbab392c7'
    out.sessao = sessao

    var chave = ''
    try {
      chave = String($secrets.get('DAPI_USER_KEY') || '')
    } catch (e1) {}
    if (chave === '') {
      out.erro = 'sem chave'
      return e.json(200, out)
    }

    function lerCorpo(resp) {
      var raw = resp.body
      if (Array.isArray(raw)) return String.fromCharCode.apply(null, raw)
      if (typeof raw === 'string') return raw
      return ''
    }

    // números que receberam resposta da IA hoje
    const alvos = ['5515996541755', '553398639806', '5511942283225', '554799152183']

    // lista os chats da sessão (até 300) e casa por telefone
    var chats = []
    for (var pagina = 1; pagina <= 3; pagina++) {
      try {
        const resp = $http.send({
          url:
            'https://api.d-api.cloud/api/v1/chats?sessionId=' +
            sessao +
            '&limit=100&page=' +
            pagina,
          method: 'GET',
          headers: { Authorization: chave, Accept: 'application/json' },
          timeout: 15,
        })
        var j = null
        try {
          j = JSON.parse(lerCorpo(resp))
        } catch (eP) {}
        if (!j || !j.data) break
        for (const c of j.data) chats.push(c)
        if (j.data.length < 100) break
      } catch (eL) {
        break
      }
    }
    out.chats_total = chats.length

    const mapa = {}
    for (const c of chats) {
      const tel = String(
        (c.contact && c.contact.phone ? c.contact.phone : '').split('@')[0],
      ).replace(/\D/g, '')
      if (tel !== '') mapa[tel] = c
    }

    for (const alvo of alvos) {
      const chat = mapa[alvo]
      if (!chat) {
        out.resultados.push({ telefone: alvo, chat: null, msgs: [] })
        continue
      }
      out.chats_encontrados.push({ telefone: alvo, chatId: chat.id })
      var msgs = []
      try {
        const resp2 = $http.send({
          url:
            'https://api.d-api.cloud/api/v1/chats/' +
            chat.id +
            '/messages?sessionId=' +
            sessao +
            '&limit=12',
          method: 'GET',
          headers: { Authorization: chave, Accept: 'application/json' },
          timeout: 15,
        })
        var j2 = null
        try {
          j2 = JSON.parse(lerCorpo(resp2))
        } catch (eP2) {}
        if (j2 && j2.data) {
          for (const m of j2.data) {
            msgs.push({
              from_me: m.from_me,
              status: String(m.status || ''),
              quando: String(m.timestamp || '').slice(0, 19),
              tipo: String(m.type || ''),
              texto: String(m.content || '').slice(0, 40),
            })
          }
        }
      } catch (eM) {}
      out.resultados.push({ telefone: alvo, chatId: chat.id, msgs: msgs })
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
