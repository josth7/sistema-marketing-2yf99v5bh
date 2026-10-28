/// <reference path="../pb_data/types.d.ts" />
/**
 * Recalcula `leitores` do sinal da conversa quando o dono do lead muda
 * (SPEC-3-005, CA-3-15: "mudar o owner de um lead tira o acesso do dono antigo
 * e dá ao novo").
 *
 * Hook de coleção em crm_leads (onRecordAfterUpdateSuccess): só observa, não
 * altera o lead. Recalcula os sinais das conversas daquele lead.
 */
onRecordAfterUpdateSuccess((e) => {
  try {
    const antes = e.record.original()
    const donoAntes = antes ? String(antes.get('owner_id') || '') : ''
    const donoAgora = String(e.record.get('owner_id') || '')
    if (donoAntes === donoAgora) {
      e.next()
      return
    }
    const colConv = $app.findCollectionByNameOrId('whatsapp_conversas')
    const colSin = $app.findCollectionByNameOrId('whatsapp_sinais')
    const colG = $app.findCollectionByNameOrId('access_grants')
    const convs = $app.findRecordsByFilter(colConv, "lead='" + e.record.id + "'", '', 50, 0)
    // base de leitores: quem tem read_conversas com escopo "todos"
    const base = []
    try {
      const grants = $app.findRecordsByFilter(colG, "revoked_at=''", '', 200, 0)
      for (const g of grants) {
        let acts = []
        let sa = []
        try {
          const rawA = g.get('actions')
          acts =
            Array.isArray(rawA) && rawA.length > 0 && typeof rawA[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawA))
              : typeof rawA === 'string'
                ? JSON.parse(rawA)
                : rawA || []
        } catch (eA) {}
        if (acts.indexOf('read_conversas') < 0) continue
        try {
          const rawS = g.get('scope_accounts')
          sa =
            Array.isArray(rawS) && rawS.length > 0 && typeof rawS[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawS))
              : typeof rawS === 'string'
                ? JSON.parse(rawS)
                : rawS || []
        } catch (eS) {}
        const ehTudo = !Array.isArray(sa) || sa.length === 0 || sa.indexOf('*') >= 0
        const uid = String(g.get('user_id') || '')
        if (uid !== '' && ehTudo && base.indexOf(uid) < 0) base.push(uid)
      }
    } catch (eB) {}
    for (const c of convs) {
      const sinais = $app.findRecordsByFilter(colSin, "conversa='" + c.id + "'", '', 1, 0)
      if (!sinais || sinais.length === 0) continue
      const leitores = base.slice()
      // vendedor dono do número
      try {
        const cx = $app.findRecordById('whatsapp_conexoes', String(c.get('conexao')))
        const vd = String(cx.get('vendedor_user') || '')
        if (vd !== '' && leitores.indexOf(vd) < 0) leitores.push(vd)
      } catch (eCx) {}
      // novo dono do lead
      if (donoAgora !== '' && leitores.indexOf(donoAgora) < 0) leitores.push(donoAgora)
      sinais[0].set('leitores', leitores)
      $app.save(sinais[0])
    }
  } catch (e) {}
  e.next()
})
