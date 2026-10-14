/**
 * Hook de diagnóstico (task ea514702) — rota mínima para isolar o 404.
 * Se /backend/v1/ping responder 200, o carregamento de hooks funciona e o
 * problema está no ingestao.js; se responder 404, é bloqueio de plataforma.
 *
 * 14/10: + diagnóstico do republish (avisos 91/93 com política real vazia) —
 * devolve o que o JSVM VÊ da report_policy (o mesmo filtro do republish).
 */
routerAdd('GET', '/backend/v1/ping', (e) => {
  return e.json(200, { ok: true, pong: new Date().toISOString() })
})

routerAdd(
  'GET',
  '/backend/v1/debug-policy',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const colP = $app.findCollectionByNameOrId('report_policy')
    const todas = $app.findRecordsByFilter(colP, '', '', 10, 0)
    const saida = []
    for (const p of todas) {
      const raw = p.get('recipient_user_ids')
      saida.push({
        id: p.id,
        fixture: p.get('fixture'),
        enabled: p.get('enabled'),
        raw_tipo: typeof raw,
        raw_valor: String(raw).slice(0, 120),
        filtro_false_casa: null,
      })
    }
    // o MESMO filtro do republish:
    const polsFalse = $app.findRecordsByFilter(colP, 'fixture=false', '', 1, 0)
    const polsTrue = $app.findRecordsByFilter(colP, 'fixture=true', '', 1, 0)
    let primeiraFalse = null
    if (polsFalse && polsFalse.length > 0) {
      const p0 = polsFalse[0]
      const raw0 = p0.get('recipient_user_ids')
      primeiraFalse = {
        id: p0.id,
        fixture: p0.get('fixture'),
        raw_tipo: typeof raw0,
        raw_valor: String(raw0).slice(0, 120),
        parseado: null,
      }
      try {
        primeiraFalse.parseado = typeof raw0 === 'string' ? JSON.parse(raw0) : raw0
      } catch (e2) {
        primeiraFalse.parseado = 'ERRO PARSE: ' + String(e2).slice(0, 80)
      }
    }
    return e.json(200, {
      ok: true,
      total: todas.length,
      registros: saida,
      filtro_false_devolveu: (polsFalse || []).length,
      primeira_do_filtro_false: primeiraFalse,
      filtro_true_devolveu: (polsTrue || []).length,
    })
  },
  $apis.requireAuth(),
)
