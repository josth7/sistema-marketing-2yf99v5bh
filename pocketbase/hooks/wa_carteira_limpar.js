/// <reference path="../pb_data/types.d.ts" />
/**
 * LIMPEZA DA BASE IMPORTADA (09/11) — uma vez, em lotes.
 *
 * **O que corrige:**
 *   1. **Nome sujo**: `25182 Paulo Vitor` → `Paulo Vitor`. O número da linha da
 *      planilha da agência ficou colado no nome em 4.921 contatos.
 *   2. **Origem vazia**: marca `origem = 'planilha_agencia'` nos contatos que
 *      vieram da importação, para a base ficar auditável.
 *
 * **O que NÃO faz:** não muda dono, não apaga contato, não mexe em telefone.
 *
 * **Em lotes** porque 48 mil registros numa chamada estouram o tempo.
 * `inicio` avança a cada chamada; `terminou` diz quando acabou.
 *
 * POST /backend/v1/carteira/limpar  { inicio: 0, tamanho: 400 }
 */
routerAdd(
  'POST',
  '/backend/v1/carteira/limpar',
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

    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {}
    const inicio = Math.max(0, Number(body.inicio || 0))
    const tamanho = Math.min(Number(body.tamanho || 400), 800)

    const out = {
      ok: true,
      inicio: inicio,
      processados: 0,
      nomes_limpos: 0,
      origem_marcada: 0,
      proximo: 0,
      terminou: false,
      total_base: 0,
    }

    var cart = []
    try {
      cart = app.findRecordsByFilter(
        app.findCollectionByNameOrId('carteira_contatos'),
        '',
        '',
        120000,
        0,
      )
    } catch (e1) {
      out.ok = false
      out.erro = 'não consegui ler a carteira'
      return e.json(200, out)
    }
    out.total_base = cart.length

    // ordena por id para o lote ser estável entre chamadas
    cart.sort(function (a, b) {
      return String(a.id).localeCompare(String(b.id))
    })
    const fatia = cart.slice(inicio, inicio + tamanho)
    out.proximo = inicio + fatia.length
    out.terminou = out.proximo >= cart.length

    for (const c of fatia) {
      out.processados++
      var mexeu = false

      // ---------- 1. limpa o nome ----------
      const nomeAtual = String(c.get('nome') || '')
      if (nomeAtual !== '') {
        // remove número(s) do começo: "25182 Paulo Vitor" -> "Paulo Vitor"
        const limpo = nomeAtual.replace(/^\s*\d{2,8}\s*[-–.]?\s*/, '').trim()
        if (limpo !== '' && limpo !== nomeAtual) {
          try {
            c.set('nome', limpo.slice(0, 200))
            mexeu = true
            out.nomes_limpos++
          } catch (eN) {}
        }
      }

      // ---------- 2. marca a origem ----------
      const org = String(c.get('origem') || '')
      if (org === '') {
        try {
          c.set('origem', 'planilha_agencia')
          mexeu = true
          out.origem_marcada++
        } catch (eO) {}
      }

      if (mexeu) {
        try {
          $app.save(c)
        } catch (eS) {
          console.log('carteira/limpar: save falhou -> ' + String(eS).slice(0, 140))
        }
      }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
