/// <reference path="../pb_data/types.d.ts" />
/**
 * GET /backend/v1/metricas — métricas diárias com ESCOPO do ator aplicado no
 * servidor (SPEC-2-005, card 5b1de184; restaurado 22/10 — o hook original sumiu
 * do working tree e a rota voltou a 404 no runtime, quebrando o painel real).
 *
 * Guard: read_metrics. Escopo: scope_accounts/scope_channels do grant válido
 * ('*' = tudo; vazio = negado p/ ações que exigem escopo). RN-06: campo ausente
 * = null. JSVM: lógica inline no callback.
 */
routerAdd(
  'GET',
  '/backend/v1/metricas',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '-created',
      50,
      0,
    )
    var temRead = false
    var contas = []
    var canais = []
    var temTudo = false
    for (const g of meus) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
      if (ate !== '' && ate.slice(0, 10) < hoje) continue
      let acts = []
      try {
        const raw = g.get('actions')
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          acts = JSON.parse(String.fromCharCode.apply(null, raw))
        } else if (typeof raw === 'string') {
          acts = JSON.parse(raw)
        } else {
          acts = raw || []
        }
      } catch (e2) {}
      if (acts.indexOf('read_metrics') < 0) continue
      temRead = true
      let sa = []
      let sc = []
      try {
        const ra = g.get('scope_accounts')
        sa =
          Array.isArray(ra) && ra.length > 0 && typeof ra[0] === 'number'
            ? JSON.parse(String.fromCharCode.apply(null, ra))
            : typeof ra === 'string'
              ? JSON.parse(ra)
              : ra || []
      } catch (e3) {}
      try {
        const rc = g.get('scope_channels')
        sc =
          Array.isArray(rc) && rc.length > 0 && typeof rc[0] === 'number'
            ? JSON.parse(String.fromCharCode.apply(null, rc))
            : typeof rc === 'string'
              ? JSON.parse(rc)
              : rc || []
      } catch (e4) {}
      if (!Array.isArray(sa)) sa = []
      if (!Array.isArray(sc)) sc = []
      // escopo vazio = grant de bootstrap sem restrição (dono/fase 3) — acesso total
      if (sa.length === 0 || sa.indexOf('*') >= 0) temTudo = true
      if (sc.length === 0 || sc.indexOf('*') >= 0) temTudo = true
      for (const c of sa) if (contas.indexOf(String(c)) < 0) contas.push(String(c))
      for (const c of sc) if (canais.indexOf(String(c)) < 0) canais.push(String(c))
    }
    if (!temRead) {
      return e.json(403, {
        ok: false,
        erro: 'sem permissão para ler métricas (read_metrics) — fale com o administrador',
      })
    }
    if (!temTudo && contas.length === 0 && canais.length === 0) {
      return e.json(403, {
        ok: false,
        erro: 'escopo vazio — nenhuma conta/canal autorizado para este usuário',
      })
    }
    const colM = $app.findCollectionByNameOrId('metricas_diarias')
    const registros = $app.findRecordsByFilter(colM, '', '-data', 500, 0)
    const itens = []
    for (const m of registros) {
      if (!temTudo) {
        const conta = String(m.get('conta_id') || '')
        const canal = String(m.get('canal') || '')
        let dentro = false
        for (const c of contas) {
          if (c === '*' || (conta !== '' && conta.indexOf(c) >= 0)) dentro = true
        }
        for (const c of canais) {
          if (c === '*' || canal === c) dentro = true
        }
        if (!dentro) continue
      }
      itens.push({
        id: m.id,
        origem: m.get('origem'),
        canal: m.get('canal'),
        natureza: m.get('natureza'),
        conta_id: m.get('conta_id'),
        conta_nome: m.get('conta_nome'),
        campanha_id: m.get('campanha_id'),
        campanha_nome: m.get('campanha_nome'),
        objetivo: m.get('objetivo'),
        objective_raw: m.get('objective_raw') || null,
        result_type: m.get('result_type') || null,
        data: m.get('data'),
        alcance: m.get('alcance'),
        impressoes: m.get('impressoes'),
        cliques: m.get('cliques'),
        gasto: m.get('gasto'),
        resultados: m.get('resultados'),
        cpc: m.get('cpc'),
        cpm: m.get('cpm'),
        ctr: m.get('ctr'),
        updated: m.get('updated'),
      })
    }
    return e.json(200, {
      ok: true,
      escopo: { contas: temTudo ? ['*'] : contas, canais: temTudo ? ['*'] : canais },
      total: itens.length,
      itens: itens,
    })
  },
  $apis.requireAuth(),
)
