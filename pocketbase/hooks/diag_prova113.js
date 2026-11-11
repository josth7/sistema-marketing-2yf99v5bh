/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA DO CA-3-113 (11/11) — as 6 mensagens do print da Sabrina (09/11 15h29).
 *
 * A regra: agradecimento, figurinha, emoji sozinho ou texto curto sem "?" com
 * palavra de agradecimento NÃO deixa o cliente esperando. Foto, áudio,
 * documento e texto com pedido continuam contando.
 *
 * Aqui se roda a MESMA função do `wa_gestao_esperando` sobre as 6 prévias do
 * print e mostra o resultado de cada uma.
 *
 * GET /backend/v1/diag/prova-113
 */
routerAdd(
  'GET',
  '/backend/v1/diag/prova-113',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    // MESMA função publicada em wa_gestao_esperando.js
    function ehEncerramento(previa, tipo) {
      const t = String(previa || '').trim()
      const tp = String(tipo || '').toLowerCase()
      if (tp === 'image' || tp === 'audio' || tp === 'document' || tp === 'video') return false
      if (t.indexOf('[foto]') >= 0 || t.indexOf('[áudio]') >= 0 || t.indexOf('[audio]') >= 0)
        return false
      if (t.indexOf('[documento]') >= 0) return false
      if (tp === 'sticker' || tp === 'reaction') return true
      if (t === '') return false
      const semEmoji = t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\s]/gu, '')
      if (semEmoji === '') return true
      if (t.indexOf('?') >= 0) return false
      const pedidos = [
        'preco',
        'preço',
        'valor',
        'quanto',
        'frete',
        'prazo',
        'medida',
        'foto',
        'catalogo',
        'catálogo',
        'pode',
        'quero',
        'tem',
        'qual',
        'quando',
        'como',
        'onde',
      ]
      const low = t.toLowerCase()
      for (const p of pedidos) if (low.indexOf(p) >= 0) return false
      const thanks = [
        'obrigado',
        'obrigada',
        'obg',
        'brigado',
        'agradeço',
        'agradeco',
        'valeu',
        'vlw',
        'ok',
        'okay',
        'blz',
        'beleza',
        'certo',
        'combinado',
        'show',
        'top',
        'perfeito',
        'ótimo',
        'otimo',
      ]
      var temThanks = false
      for (const th of thanks) if (low.indexOf(th) >= 0) temThanks = true
      if (!temThanks) return false
      const palavras = t.split(/\s+/).filter(function (x) {
        return x !== ''
      })
      if (palavras.length > 6) return false
      return true
    }

    // as 6 prévias do print da Sabrina + o caso do frete
    const casos = [
      { previa: 'texto NOVO', tipo: 'text', espera: true },
      { previa: 'Imagem', tipo: 'image', espera: true },
      { previa: 'Obrigado', tipo: 'text', espera: false },
      { previa: 'Ah muito obrigada Deus abençoe', tipo: 'text', espera: false },
      { previa: 'Obg', tipo: 'text', espera: false },
      { previa: 'Obrigada Fabio', tipo: 'text', espera: false },
      { previa: 'Obrigado, qual o frete?', tipo: 'text', espera: true },
    ]

    const out = { ok: true, resultados: [], acertos: 0, total: 0 }
    for (const c of casos) {
      const fecha = ehEncerramento(c.previa, c.tipo)
      const esperaReal = !fecha
      const ok = esperaReal === c.espera
      out.total++
      if (ok) out.acertos++
      out.resultados.push({
        previa: c.previa,
        tipo: c.tipo,
        espera: esperaReal,
        esperado: c.espera,
        ok: ok,
      })
    }
    out.green = out.acertos === out.total
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
