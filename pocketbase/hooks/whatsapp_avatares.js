/// <reference path="../pb_data/types.d.ts" />
/**
 * WhatsApp — avatar REAL do contato (30/10).
 *
 * O dono recusou avatar de iniciais: quer a foto do WhatsApp do cliente.
 *
 * A D-API expõe `GET /api/v1/contacts/{phone}/avatar?sessionId=...`. Esta rota
 * busca a foto pelo número DA CONEXÃO da conversa (cada vendedor tem a chave
 * dele no cofre, então a foto vem pelo número que atende o cliente) e guarda
 * a URL em `whatsapp_conversas.avatar_url` com a data da busca.
 *
 * Regra de cache: não busca de novo se já tem avatar e a última busca foi
 * recente. `?forcar=1` ignora o cache (útil quando o cliente troca a foto).
 * Quem NÃO tem foto fica com `avatar_em` preenchido e `avatar_url` vazio —
 * assim a tela mostra as iniciais sem ficar batendo na API a cada abertura.
 *
 * Acesso: mesma regra de sempre — só devolve avatar de conversa que o usuário
 * pode ver (RN-87). Nada de foto de conversa alheia.
 *
 * JSVM: $http.send devolve corpo como ARRAY DE CHAR-CODES — converter com
 * String.fromCharCode; $secrets.get (não existe $os.env); lógica INLINE.
 */

routerAdd(
  'GET',
  '/backend/v1/whatsapp/avatares',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    function lerLista(raw) {
      let out = []
      try {
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          out = JSON.parse(String.fromCharCode.apply(null, raw))
        } else if (typeof raw === 'string') {
          out = JSON.parse(raw)
        } else {
          out = raw || []
        }
      } catch (err) {}
      return Array.isArray(out) ? out : []
    }

    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '-created',
      60,
      0,
    )
    var temConversas = false
    var temTudo = false
    var ehGestao = false
    for (const g of meus) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
      if (ate !== '' && ate.slice(0, 10) < hoje) continue
      const acts = lerLista(g.get('actions'))
      if (acts.indexOf('read_conversas') >= 0) temConversas = true
      if (acts.indexOf('read_leads') >= 0) {
        const sa = lerLista(g.get('scope_accounts'))
        if (sa.indexOf('*') >= 0) temTudo = true
      }
      if (acts.indexOf('manage_atendimento') >= 0) ehGestao = true
    }
    if (!temConversas) {
      return e.json(403, { ok: false, erro: 'sem permissão (read_conversas)' })
    }

    const forcar = String(e.request.url.query().get('forcar') || '') === '1'
    const pedidas = String(e.request.url.query().get('conversas') || '')
    const ids = []
    for (const bruto of pedidas.split(',')) {
      const limpo = bruto.replace(/[^a-zA-Z0-9]/g, '').slice(0, 15)
      if (limpo !== '' && ids.length < 25 && ids.indexOf(limpo) < 0) ids.push(limpo)
    }

    var consultas = 0
    const resultado = {}
    const agora = new Date().getTime()
    const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000 // uma semana

    for (const cid of ids) {
      var conv = null
      try {
        conv = $app.findRecordById('whatsapp_conversas', cid)
      } catch (errC) {
        continue
      }

      // ---------- RN-87: só a conversa que ele pode ver ----------
      var conexao = null
      try {
        conexao = $app.findRecordById('whatsapp_conexoes', String(conv.get('conexao')))
      } catch (errCx) {}
      if (!conexao) continue
      const papel = String(conexao.get('papel') || '')
      const vendedorDaConexao = String(conexao.get('vendedor_user') || '')
      var lead = null
      try {
        if (String(conv.get('lead') || '') !== '') {
          lead = $app.findRecordById('crm_leads', String(conv.get('lead')))
        }
      } catch (errL) {}
      var pode = false
      if (temTudo || ehGestao) pode = true
      if (papel === 'vendedor' && vendedorDaConexao === e.auth.id) pode = true
      if (
        papel === 'central' &&
        lead &&
        String(lead.get('owner_id') || '') === e.auth.id &&
        String(lead.get('owner_id') || '') !== ''
      ) {
        pode = true
      }
      if (!pode) continue

      // ---------- cache ----------
      const urlAtual = String(conv.get('avatar_url') || '')
      const quando = String(conv.get('avatar_em') || '')
      var fresco = false
      if (!forcar && quando !== '') {
        try {
          const t = new Date(quando).getTime()
          if (t > 0 && agora - t < VALIDADE_MS) fresco = true
        } catch (errT) {}
      }
      resultado[cid] = urlAtual
      if (fresco) continue
      if (consultas >= 8) continue // teto por requisição (a tela chama em lotes)

      // ---------- busca na D-API ----------
      const telefone = String(conv.get('contato_telefone') || '').replace(/[^0-9]/g, '')
      if (telefone.length < 10) continue
      const sessionId = String(conexao.get('session_id') || '')
      if (sessionId === '') continue
      var chave = ''
      try {
        chave = String($secrets.get(String(conexao.get('nome_segredo_chave') || '')) || '')
      } catch (errS) {}
      if (chave === '') continue

      consultas = consultas + 1
      var foto = ''
      var debugStatus = 0
      var debugCorpo = ''
      try {
        const resp = $http.send({
          url:
            'https://api.deliverify.io/api/v1/contacts/' +
            telefone +
            '/avatar?sessionId=' +
            encodeURIComponent(sessionId) +
            (forcar ? '&force=true' : ''),
          method: 'GET',
          headers: { Authorization: chave },
          timeout: 15,
        })
        var corpo = ''
        var raw = resp.body
        if (Array.isArray(raw)) corpo = String.fromCharCode.apply(null, raw)
        else if (typeof raw === 'string') corpo = raw
        debugStatus = Number(resp.statusCode || 0)
        debugCorpo = corpo.slice(0, 400)
        if (Number(resp.statusCode || 0) >= 200 && Number(resp.statusCode || 0) < 300) {
          const j = JSON.parse(corpo)
          // a resposta pode vir em data.url, data.avatarUrl, url…
          const d = j.data || j
          foto = String(
            d.url || d.avatarUrl || d.avatar_url || d.profilePictureUrl || d.picture || '',
          )
        }
      } catch (errH) {}

      if (String(e.request.url.query().get('debug') || '') === '1') {
        resultado[cid] = '[' + debugStatus + '] ' + debugCorpo
        continue
      }
      try {
        conv.set('avatar_url', foto.slice(0, 600))
        conv.set('avatar_em', new Date().toISOString())
        $app.save(conv)
        resultado[cid] = foto.slice(0, 600)
      } catch (errSv) {}
    }

    return e.json(200, {
      ok: true,
      consultas: consultas,
      itens: resultado,
    })
  },
  $apis.requireAuth(),
)
