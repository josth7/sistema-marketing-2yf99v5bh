/// <reference path="../pb_data/types.d.ts" />
/**
 * CONVERSAS ESPERANDO RESPOSTA (06/11) — leitura para a gestão decidir.
 *
 * São conversas cuja **última mensagem é do cliente** e ninguém respondeu.
 * O número é grande (200), então a gestão precisa saber **de quem são** antes
 * de cobrar: por vendedor, por número, e há quanto tempo esperam.
 *
 * GET /backend/v1/gestao/esperando
 */
routerAdd(
  'GET',
  '/backend/v1/gestao/esperando',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    function lerL(raw) {
      try {
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          return JSON.parse(String.fromCharCode.apply(null, raw))
        }
        if (typeof raw === 'string') return JSON.parse(raw)
        return raw || []
      } catch (err) {
        return []
      }
    }

    const app = $app
    const hoje = new Date().toISOString().slice(0, 10)
    var ehGestao = false
    try {
      const meus = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      for (const g of meus) {
        const de = String(g.get('valid_from') || '')
        const ate = String(g.get('valid_until') || '')
        if (de !== '' && de.slice(0, 10) > hoje) continue
        if (ate !== '' && ate.slice(0, 10) < hoje) continue
        const esc = lerL(g.get('scope_accounts'))
        if (Array.isArray(esc) && esc.indexOf('*') >= 0) ehGestao = true
      }
    } catch (e0) {}
    if (!ehGestao) return e.json(404, { ok: false, erro: 'não encontrado' })

    const out = {
      ok: true,
      total: 0,
      por_vendedor: {},
      por_numero: {},
      mais_antiga_horas: 0,
      faixas: { ate_1h: 0, ate_24h: 0, ate_7d: 0, mais_7d: 0 },
      itens: [],
    }

    var convs = []
    try {
      convs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        'fixture=false',
        '',
        8000,
        0,
      )
    } catch (e1) {
      out.ok = false
      out.erro = String(e1).slice(0, 140)
      return e.json(200, out)
    }

    // dono do lead de cada conversa
    const donoDoLead = {}
    const nomes = {}
    try {
      for (const l of app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '',
        12000,
        0,
      )) {
        donoDoLead[l.id] = String(l.get('owner_id') || '')
      }
      for (const u of app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        '',
        '',
        300,
        0,
      )) {
        nomes[u.id] = String(u.get('name') || u.get('email') || '')
      }
    } catch (e2) {}

    const nomesCx = {}
    try {
      for (const c of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        '',
        '',
        50,
        0,
      )) {
        nomesCx[c.id] = String(c.get('nome_exibicao') || c.get('papel') || '')
      }
    } catch (e3) {}

    const agoraMs = new Date().getTime()
    for (const cv of convs) {
      if (String(cv.get('ultimo_autor') || '') !== 'cliente') continue
      const q = new Date(String(cv.get('ultima_mensagem_em') || '')).getTime()
      const horas = q > 0 ? Math.round((agoraMs - q) / 3600000) : -1

      const dono = donoDoLead[String(cv.get('lead') || '')] || ''
      const vend = dono !== '' ? nomes[dono] || '(?)' : 'SEM DONO'
      const num = nomesCx[String(cv.get('conexao') || '')] || '(?)'

      out.por_vendedor[vend] = (out.por_vendedor[vend] || 0) + 1
      out.por_numero[num] = (out.por_numero[num] || 0) + 1
      if (horas > out.mais_antiga_horas) out.mais_antiga_horas = horas

      if (horas < 0) out.faixas.mais_7d++
      else if (horas <= 1) out.faixas.ate_1h++
      else if (horas <= 24) out.faixas.ate_24h++
      else if (horas <= 168) out.faixas.ate_7d++
      else out.faixas.mais_7d++

      out.total++
      if (out.itens.length < 400) {
        out.itens.push({
          id: cv.id,
          nome: String(cv.get('contato_nome') || ''),
          telefone: String(cv.get('contato_telefone') || ''),
          vendedor: vend,
          numero: num,
          horas: horas,
          previa: String(cv.get('ultima_previa') || '').slice(0, 60),
        })
      }
    }

    // mais antigas primeiro
    out.itens.sort(function (a, b) {
      return b.horas - a.horas
    })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
