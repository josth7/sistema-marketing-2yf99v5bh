/// <reference path="../pb_data/types.d.ts" />
// ===================================================================
// MIG 0101 — REDISTRIBUI os leads que estavam no nome do Josth (03/11).
//
// Contexto: em 30/10 o motor distribuiu os leads SEM DONO. Os 343 que já
// estavam no nome do Josth (Direção) ficaram lá — ele não atende. Cada um
// tem um único evento: o de criação. Nenhum foi trabalhado.
//
// Efeito colateral: com 343 no nome dele, os 4 vendedores aparecem com carga
// menor que a real, então o rodízio distribui enviesado.
//
// O QUE FAZ
//   1. acha o usuário de direção (e-mail josth* ou nome com "Direção")
//   2. acha os vendedores elegíveis (mesma regra do rodízio: tem
//      read_conversas/read_leads e NÃO é gestão de escopo '*')
//   3. pega os leads do direção que NÃO estão decididos
//      (fora de venda_realizada/finalizado/descartado)
//   4. distribui UM A UM para o de menor carga naquele momento (equilíbrio real)
//   5. grava evento na trilha de cada lead
//
// NÃO toca em lead de outro dono. NÃO apaga nada. Reversível pelo rollback
// (devolve os leads ao direção).
// ===================================================================
migrate(
  (app) => {
    const colU = app.findCollectionByNameOrId('users')
    const colG = app.findCollectionByNameOrId('access_grants')
    const colL = app.findCollectionByNameOrId('crm_leads')
    const colEv = app.findCollectionByNameOrId('crm_lead_events')

    // ---------- 1. quem é a direção ----------
    var direcao = null
    try {
      const us = app.findRecordsByFilter(colU, '', '', 200, 0)
      for (const u of us) {
        const em = String(u.get('email') || '').toLowerCase()
        const nm = String(u.get('name') || '')
        if (em.indexOf('josth') >= 0 || nm.indexOf('Direção') >= 0) {
          direcao = u
          break
        }
      }
    } catch (e0) {}
    if (!direcao) {
      console.log('0101: direcao nao encontrada — nada a fazer')
      return
    }
    const idDirecao = direcao.id
    console.log('0101: direcao = ' + String(direcao.get('email') || idDirecao))

    // ---------- 2. vendedores elegíveis ----------
    var vendedores = []
    try {
      const us = app.findRecordsByFilter(colU, '', '', 200, 0)
      for (const u of us) {
        const em = String(u.get('email') || '')
        const nm = String(u.get('name') || '')
        if (em === '' || em.toLowerCase().indexOf('fixture') >= 0) continue
        if (nm.toLowerCase().indexOf('fixture') >= 0) continue
        if (em.indexOf('josth') >= 0) continue
        if (u.id === idDirecao) continue
        var ehVendedor = false
        var ehGestao = false
        try {
          const gs = app.findRecordsByFilter(
            colG,
            "user_id='" + u.id + "' && revoked_at=''",
            '',
            20,
            0,
          )
          for (const g of gs) {
            let a = []
            let sc = []
            try {
              const rawA = g.get('actions')
              a =
                Array.isArray(rawA) && rawA.length > 0 && typeof rawA[0] === 'number'
                  ? JSON.parse(String.fromCharCode.apply(null, rawA))
                  : typeof rawA === 'string'
                    ? JSON.parse(rawA)
                    : rawA || []
            } catch (eA) {}
            try {
              const rawS = g.get('scope_accounts')
              sc =
                Array.isArray(rawS) && rawS.length > 0 && typeof rawS[0] === 'number'
                  ? JSON.parse(String.fromCharCode.apply(null, rawS))
                  : typeof rawS === 'string'
                    ? JSON.parse(rawS)
                    : rawS || []
            } catch (eS) {}
            if (Array.isArray(sc) && sc.indexOf('*') >= 0) ehGestao = true
            if (a.indexOf('read_conversas') >= 0 || a.indexOf('read_leads') >= 0) ehVendedor = true
          }
        } catch (eG) {}
        if (!ehVendedor || ehGestao) continue
        vendedores.push({ id: u.id, nome: String(u.get('name') || em), carga: 0 })
      }
    } catch (e1) {}
    if (vendedores.length === 0) {
      console.log('0101: nenhum vendedor elegivel — nada a fazer')
      return
    }

    // ---------- 3. carga REAL de todos os leads ativos ----------
    var todos = []
    try {
      todos = app.findRecordsByFilter(colL, 'fixture=false', '', 6000, 0)
    } catch (e2) {
      console.log('0101: nao consegui listar leads: ' + e2)
      return
    }
    const carga = {}
    const paraMover = []
    for (const l of todos) {
      const ow = String(l.get('owner_id') || '')
      const st = String(l.get('status') || 'entrada_lead')
      const decidido = st === 'venda_realizada' || st === 'finalizado' || st === 'descartado'
      if (ow === idDirecao) {
        if (!decidido) paraMover.push(l)
        continue
      }
      if (ow === '' || decidido) continue
      carga[ow] = (carga[ow] || 0) + 1
    }
    for (const v of vendedores) v.carga = carga[v.id] || 0

    console.log('0101: ' + paraMover.length + ' lead(s) a redistribuir')
    if (paraMover.length === 0) return

    // ---------- 4. distribui um a um para o de menor carga ----------
    var movidos = 0
    for (const l of paraMover) {
      var escolhido = null
      for (const v of vendedores) {
        if (!escolhido || v.carga < escolhido.carga) escolhido = v
      }
      if (!escolhido) break
      try {
        l.set('owner_id', escolhido.id)
        l.set('vendedor_nome', escolhido.nome)
        app.save(l)
        escolhido.carga++
        movidos++
        // evento na trilha
        try {
          const ev = new Record(colEv)
          ev.set('lead_id', l.id)
          ev.set('tipo', 'status')
          ev.set(
            'texto',
            'Redistribuído da Direção para ' + escolhido.nome + ' (carga equilibrada, 03/11)',
          )
          ev.set('fixture', false)
          app.save(ev)
        } catch (eEv) {}
      } catch (eSave) {}
    }

    var resumo = '0101 RESULTADO: ' + movidos + ' lead(s) redistribuido(s) | '
    for (const v of vendedores) resumo += v.nome + '=' + v.carga + ' '
    console.log(resumo)
  },
  (app) => {
    // rollback: devolve ao direção os leads que esta migração moveu
    const colU = app.findCollectionByNameOrId('users')
    const colL = app.findCollectionByNameOrId('crm_leads')
    var direcao = null
    try {
      const us = app.findRecordsByFilter(colU, '', '', 200, 0)
      for (const u of us) {
        const em = String(u.get('email') || '').toLowerCase()
        const nm = String(u.get('name') || '')
        if (em.indexOf('josth') >= 0 || nm.indexOf('Direção') >= 0) {
          direcao = u
          break
        }
      }
    } catch (e0) {}
    if (!direcao) return
    var leads = []
    try {
      leads = app.findRecordsByFilter(colL, 'fixture=false', '', 6000, 0)
    } catch (e1) {
      return
    }
    var devolvidos = 0
    for (const l of leads) {
      // so os que tem o evento desta migracao
      try {
        const evs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('crm_lead_events'),
          "lead_id='" + l.id + "' && texto~'Redistribuído da Direção'",
          '',
          1,
          0,
        )
        if (evs && evs.length > 0) {
          l.set('owner_id', direcao.id)
          l.set('vendedor_nome', String(direcao.get('name') || ''))
          app.save(l)
          devolvidos++
        }
      } catch (e2) {}
    }
    console.log('0101 rollback: ' + devolvidos + ' lead(s) devolvido(s) a Direção')
  },
)
