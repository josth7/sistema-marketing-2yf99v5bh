/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA DO PARSER (10/11) — CA-3-108 com o formato REAL.
 *
 * Os payloads abaixo são **cópias literais** dos dois `message.failed` reais
 * capturados hoje (Fábio e Adriana), sem nome nem telefone.
 *
 * GET /backend/v1/diag/prova-parser-real
 */
routerAdd(
  'GET',
  '/backend/v1/diag/prova-parser-real',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    // MESMA função publicada no webhook
    function extrairMotivo(d) {
      if (!d) return ''
      if (d.error_title) return String(d.error_title)
      if (d.error_details) return String(d.error_details)
      if (typeof d.error === 'string' && d.error !== '') return d.error
      if (d.error && typeof d.error === 'object') {
        const m = d.error.message || d.error.title || d.error.error_data || ''
        if (m !== '') return String(m)
      }
      if (d.reason) return String(d.reason)
      if (d.message) return String(d.message)
      if (d.title) return String(d.title)
      if (d.error_code) return 'codigo ' + String(d.error_code)
      return ''
    }

    const casos = [
      {
        caso: 'REAL 1 — 130497 com titulo',
        data: {
          message_id: 'wamid.X',
          remote_jid: '***',
          participant: '',
          timestamp: '0',
          error_code: 130497,
          error_title: 'Business account is restricted from messaging users in this country.',
          error_details: 'Business account is restricted from messaging users in this country.',
        },
      },
      {
        caso: 'REAL 2 — 130497 sem titulo',
        data: {
          message_id: 'wamid.X',
          remote_jid: '***',
          participant: '',
          timestamp: '0',
          error_code: 130497,
          error_title: '',
          error_details: '',
        },
      },
      {
        caso: 'D-API recusou no envio (texto)',
        data: { success: false, error: '(#131009) Parameter value is not valid' },
      },
      {
        caso: 'vazio',
        data: {},
      },
    ]

    const out = { ok: true, resultados: [] }
    for (const c of casos) {
      const m = extrairMotivo(c.data)
      const final = m !== '' ? m : 'falha_nao_informada'
      var cod = ''
      const mc = final.match(/(\d{5,6})/)
      if (mc) cod = mc[1]
      if (cod === '' && c.data.error_code) cod = String(c.data.error_code)
      out.resultados.push({
        caso: c.caso,
        motivo: final.slice(0, 90),
        codigo: cod !== '' ? cod : '(sem codigo)',
        ok: final !== 'falha_nao_informada' || c.caso === 'vazio',
      })
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
