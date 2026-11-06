/// <reference path="../pb_data/types.d.ts" />
/**
 * MODELOS APROVADOS E PRÉVIA — CA-3-81 (SPEC-3-016, 06/11).
 *
 * **O problema:** a tela de campanha pede o nome do modelo digitado à mão. Errar
 * uma letra faz a Meta recusar o envio de todo mundo — e o erro só aparece
 * depois, com a campanha já criada.
 *
 * **O que estas rotas fazem:**
 *   1. listam os modelos **aprovados** daquele número, direto da Meta, com
 *      categoria e tipo de cabeçalho (texto, imagem, vídeo);
 *   2. mostram a **prévia** exatamente como o cliente vai receber, com a imagem
 *      e as variáveis preenchidas com um contato real da base.
 *
 * **Por que a prévia importa:** é o último ponto antes de mandar mensagem para
 * milhares de pessoas. Ver antes evita mandar "{{1}}" cru para o cliente.
 *
 * **Sem modelo aprovado não há campanha.** A Meta só aceita template fora da
 * janela de 24h; texto livre não passa.
 *
 * Rotas:
 *   GET /backend/v1/campanhas/modelos?conexao=<id>     → aprovados daquele número
 *   GET /backend/v1/campanhas/previa-modelo?conexao=&modelo=  → como o cliente vê
 *
 * JSVM: helpers INLINE; $http.send devolve char-codes.
 */
routerAdd(
  'GET',
  '/backend/v1/campanhas/modelos',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    const app = $app
    const conexaoId = String(e.request.url.query().get('conexao') || '')
    const out = { ok: true, conexao: conexaoId, total: 0, modelos: [], aviso: '', erro: '' }

    // ---------- permissão: gestão ----------
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
    if (!ehGestao) return e.json(403, { ok: false, erro: 'só a gestão vê os modelos' })

    if (conexaoId === '') return e.json(422, { ok: false, erro: 'informe ?conexao=' })

    var cx = null
    try {
      cx = app.findRecordById('whatsapp_conexoes', conexaoId)
    } catch (e1) {
      return e.json(404, { ok: false, erro: 'conexão não encontrada' })
    }

    const sessao = String(cx.get('session_id') || '')
    if (sessao === '') {
      out.ok = false
      out.erro = 'este número não tem sessão na D-API'
      return e.json(200, out)
    }

    // ---------- busca na D-API (que fala com a Meta) ----------
    var chave = ''
    try {
      const nomeChave = String(cx.get('nome_segredo_chave') || '')
      if (nomeChave !== '') chave = String($secrets.get(nomeChave) || '')
      if (chave === '') chave = String($secrets.get('DAPI_USER_KEY') || '')
    } catch (e2) {}

    var resp = null
    try {
      const r = $http.send({
        url:
          'https://api.d-api.cloud/api/v1/connections/cloud-api/' +
          encodeURIComponent(sessao) +
          '/templates',
        method: 'GET',
        headers: { Authorization: chave, Accept: 'application/json' },
        timeout: 25,
      })
      var corpo = r.body
      if (Array.isArray(corpo)) corpo = String.fromCharCode.apply(null, corpo)
      const st = Number(r.statusCode || 0)
      if (st >= 200 && st < 300) {
        try {
          resp = JSON.parse(String(corpo))
        } catch (eP) {
          out.aviso = 'a D-API devolveu algo que não é lista de modelos'
        }
      } else {
        out.aviso =
          'a Meta ainda não devolveu a lista (HTTP ' + st + '). Informe o nome do modelo à mão.'
        out.detalhe = String(corpo).slice(0, 160)
      }
    } catch (e3) {
      out.aviso = 'não consegui falar com a D-API agora. Informe o nome do modelo à mão.'
    }

    // ---------- normaliza a lista ----------
    if (resp) {
      var lista = resp.data || resp.templates || resp
      if (!Array.isArray(lista)) lista = []
      for (const t of lista) {
        const status = String(t.status || t.estado || '').toUpperCase()
        // só APROVADO entra — o resto não pode ser usado
        if (status !== 'APPROVED' && status !== 'APROVADO') continue
        var cabecalho = ''
        var componentes = t.components || []
        if (Array.isArray(componentes)) {
          for (const c of componentes) {
            if (String(c.type || '').toUpperCase() === 'HEADER') {
              cabecalho = String(c.format || '').toLowerCase()
            }
          }
        }
        out.modelos.push({
          nome: String(t.name || t.nome || ''),
          categoria: String(t.category || t.categoria || ''),
          idioma: String(t.language || t.idioma || ''),
          cabecalho: cabecalho,
          corpo: (function () {
            if (!Array.isArray(componentes)) return ''
            for (const c of componentes) {
              if (String(c.type || '').toUpperCase() === 'BODY') return String(c.text || '')
            }
            return ''
          })(),
        })
      }
      out.total = out.modelos.length
      if (out.total === 0) {
        out.aviso = 'nenhum modelo APROVADO neste número ainda'
      }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)

// ==================== PRÉVIA DO MODELO ====================
routerAdd(
  'GET',
  '/backend/v1/campanhas/previa-modelo',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    const app = $app
    const conexaoId = String(e.request.url.query().get('conexao') || '')
    const modelo = String(e.request.url.query().get('modelo') || '')
    const out = {
      ok: true,
      modelo: modelo,
      cabecalho: '',
      imagem_url: '',
      corpo: '',
      variaveis: [],
      contato_exemplo: '',
      aviso: '',
    }

    if (conexaoId === '' || modelo === '') {
      return e.json(422, { ok: false, erro: 'informe ?conexao= e ?modelo=' })
    }

    // ---------- um contato real da base para preencher as variáveis ----------
    var exemplo = null
    try {
      const leads = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '',
        5,
        0,
      )
      if (leads.length > 0) exemplo = leads[0]
    } catch (e0) {}
    const nomeExemplo = exemplo ? String(exemplo.get('nome') || 'Cliente') : 'Cliente'
    const telExemplo = exemplo ? String(exemplo.get('telefone') || '') : ''
    out.contato_exemplo = nomeExemplo + (telExemplo !== '' ? ' · ' + telExemplo : '')

    // ---------- busca o modelo na Meta ----------
    var cx = null
    try {
      cx = app.findRecordById('whatsapp_conexoes', conexaoId)
    } catch (e1) {}
    var chave = ''
    try {
      const nomeChave = cx ? String(cx.get('nome_segredo_chave') || '') : ''
      if (nomeChave !== '') chave = String($secrets.get(nomeChave) || '')
    } catch (e2) {}

    var achado = null
    if (cx && chave !== '') {
      try {
        const r = $http.send({
          url:
            'https://api.d-api.cloud/api/v1/connections/cloud-api/' +
            encodeURIComponent(String(cx.get('session_id') || '')) +
            '/templates',
          method: 'GET',
          headers: { Authorization: chave, Accept: 'application/json' },
          timeout: 25,
        })
        var corpo = r.body
        if (Array.isArray(corpo)) corpo = String.fromCharCode.apply(null, corpo)
        if (Number(r.statusCode || 0) === 200) {
          const j = JSON.parse(String(corpo))
          var lista = j.data || j.templates || j
          if (Array.isArray(lista)) {
            for (const t of lista) {
              if (String(t.name || t.nome || '') !== modelo) continue
              achado = t
              break
            }
          }
        }
      } catch (e3) {}
    }

    if (!achado) {
      out.aviso =
        'não achei este modelo na Meta agora. A prévia mostra o texto que a gestão escreveu; confira o nome exato antes de aprovar.'
      return e.json(200, out)
    }

    // ---------- monta a prévia com as variáveis preenchidas ----------
    const componentes = achado.components || []
    if (Array.isArray(componentes)) {
      for (const c of componentes) {
        const tipo = String(c.type || '').toUpperCase()
        if (tipo === 'HEADER') {
          out.cabecalho = String(c.format || '').toLowerCase()
          if (out.cabecalho === 'image' && c.example) out.imagem_url = 'exemplo do modelo'
        }
        if (tipo === 'BODY') {
          var texto = String(c.text || '')
          // troca {{1}}, {{2}}... pelo exemplo do próprio modelo ou pelo contato
          const ex = c.example && c.example.body_text ? c.example.body_text : null
          if (Array.isArray(ex) && ex.length > 0) {
            var lista0 = ex[0]
            if (Array.isArray(lista0)) {
              for (var i = 0; i < lista0.length; i++) {
                texto = texto.split('{{' + (i + 1) + '}}').join(String(lista0[i]))
                out.variaveis.push({ posicao: i + 1, valor: String(lista0[i]) })
              }
            }
          } else {
            // sem exemplo na Meta: usa o contato real
            texto = texto.split('{{1}}').join(nomeExemplo)
            if (telExemplo !== '') texto = texto.split('{{2}}').join(telExemplo)
            out.variaveis.push({ posicao: 1, valor: nomeExemplo })
          }
          out.corpo = texto
        }
      }
    }

    // sobrou variável sem preencher? avisa — é isso que NÃO pode ir para cliente
    if (out.corpo.indexOf('{{') >= 0) {
      out.aviso = 'ainda há variável sem valor nesta prévia. Não aprove antes de preencher todas.'
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
