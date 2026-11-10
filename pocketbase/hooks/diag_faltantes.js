routerAdd(
  'GET',
  '/backend/v1/diag/faltantes',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { total: 0, mais_antigo: '', mais_novo: '', amostra: [] }
    for (const nome of ['whatsapp_mensagens', 'whatsapp_envios', 'whatsapp_eventos']) {
      var regs = []
      try {
        regs = app.findRecordsByFilter(nome, '', '', 200000, 0)
      } catch (e1) {
        continue
      }
      for (const r of regs) {
        if (String(r.get('empresa') || '') !== '') continue
        out.total++
        const c = String(r.get('created') || '')
        if (out.mais_antigo === '' || c < out.mais_antigo) out.mais_antigo = c
        if (c > out.mais_novo) out.mais_novo = c
        if (out.amostra.length < 4) out.amostra.push({ col: nome, quando: c.slice(0, 16) })
      }
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
