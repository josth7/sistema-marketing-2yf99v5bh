/// <reference path="../pb_data/types.d.ts" />
/**
 * CONTAGEM DA CARTEIRA (05/11) — leitura, só gestão.
 *
 * A base das 4 carteiras foi gravada pelo consultor em `carteira_contatos`
 * (lotes `imp-0511-exclusivo` e `imp-0511-conflito`). O dono pediu para NÃO
 * reimportar nem apagar, então esta rota só CONTA — para o CA-3-57 saber com
 * o que trabalha.
 *
 * GET /backend/v1/diag/carteira-contagem
 */
routerAdd(
  'GET',
  '/backend/v1/diag/carteira-contagem',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, total: 0, por_lote: {}, por_vendedor: {}, conflitos: 0, amostra: [] }

    var conts = []
    try {
      conts = app.findRecordsByFilter(
        app.findCollectionByNameOrId('carteira_contatos'),
        '',
        '',
        120000,
        0,
      )
    } catch (e0) {
      out.ok = false
      out.erro = String(e0).slice(0, 160)
      return e.json(200, out)
    }
    out.total = conts.length

    // nomes dos vendedores
    const nomes = {}
    try {
      for (const u of app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        '',
        '',
        300,
        0,
      )) {
        nomes[u.id] = String(u.get('name') || u.get('email') || '')
      }
    } catch (e1) {}

    // telefone -> quantas conexões diferentes
    const porTel = {}
    for (const c of conts) {
      const l = String(c.get('lote') || '(sem lote)')
      out.por_lote[l] = (out.por_lote[l] || 0) + 1
      const v = nomes[String(c.get('vendedor_user') || '')] || '(sem vendedor)'
      out.por_vendedor[v] = (out.por_vendedor[v] || 0) + 1
      const tel = String(c.get('telefone') || '')
      if (tel !== '') {
        if (!porTel[tel]) porTel[tel] = {}
        porTel[tel][String(c.get('conexao') || '')] = true
      }
    }
    for (const t in porTel) {
      if (Object.keys(porTel[t]).length > 1) out.conflitos++
    }

    for (const c of conts.slice(0, 5)) {
      out.amostra.push({
        telefone: String(c.get('telefone') || ''),
        nome: String(c.get('nome') || ''),
        lote: String(c.get('lote') || ''),
        vendedor: nomes[String(c.get('vendedor_user') || '')] || '',
      })
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
