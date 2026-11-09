/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA (09/11) — o parser extrai o motivo do formato REAL? (CA-3-108)
 *
 * O formato capturado da D-API foi:
 *   {"success":false,"error":"(#131009) Parameter value is not valid"}
 *
 * Antes, o código lia `data.error.message` (undefined em texto) e gravava
 * `falha_nao_informada`. Aqui se testa o MESMO formato e mostra o que sai.
 *
 * GET /backend/v1/diag/prova-parser
 */
routerAdd(
  'GET',
  '/backend/v1/diag/prova-parser',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    // mesma função do webhook
    function extrairMotivo(d) {
      if (!d) return ''
      if (typeof d.error === 'string' && d.error !== '') return d.error
      if (d.error && typeof d.error === 'object') {
        const m = d.error.message || d.error.title || d.error.error_data || ''
        if (m !== '') return String(m)
      }
      if (d.reason) return String(d.reason)
      if (d.message) return String(d.message)
      if (d.title) return String(d.title)
      return ''
    }

    const casos = [
      {
        nome: 'D-API real (#131009 texto)',
        data: { success: false, error: '(#131009) Parameter value is not valid' },
      },
      {
        nome: 'Meta antiga (error objeto)',
        data: { error: { message: 'Invalid parameter', code: 100 } },
      },
      { nome: 'so message', data: { message: 'algo deu errado' } },
      { nome: 'vazio', data: {} },
    ]

    const out = { ok: true, resultados: [] }
    for (const c of casos) {
      const bruto = extrairMotivo(c.data)
      const final = bruto !== '' ? bruto : 'falha_nao_informada'
      // extrai o código como o webhook faz
      var cod = ''
      const m = final.match(/(\d{5,6})/)
      if (m) cod = m[1]
      out.resultados.push({
        caso: c.nome,
        motivo: final.slice(0, 80),
        codigo: cod !== '' ? cod : '(sem codigo)',
        ok: final !== 'falha_nao_informada' || c.nome === 'vazio',
      })
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
