/// <reference path="../pb_data/types.d.ts" />
/**
 * VERIFICAÇÃO CA-3-29 — cargo e números por pessoa (06/11).
 *
 * A regra: cada pessoa tem um **cargo** e os **números de WhatsApp que pode
 * ver**, mantendo os acessos que já existem.
 *
 * Esta rota responde, sem alterar nada:
 *   - quantas pessoas existem e quantas estão ativas
 *   - cada pessoa: cargo, números, quantas ações tem
 *   - alguém sem cargo? (é o defeito que o card quer evitar)
 *   - algum número sem dono?
 *
 * GET /backend/v1/diag/verifica-cargos
 */
routerAdd(
  'GET',
  '/backend/v1/diag/verifica-cargos',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = {
      ok: true,
      total_pessoas: 0,
      ativas: 0,
      sem_cargo: [],
      por_cargo: {},
      numeros_com_dono: 0,
      numeros_sem_dono: 0,
      pessoas: [],
    }

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

    var users = []
    try {
      users = app.findRecordsByFilter(app.findCollectionByNameOrId('users'), '', '', 400, 0)
    } catch (e0) {
      out.ok = false
      out.erro = String(e0).slice(0, 140)
      return e.json(200, out)
    }
    const hoje = new Date().toISOString().slice(0, 10)

    // conexões por vendedor
    const numsPorUser = {}
    try {
      for (const c of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        'ativo=true',
        '',
        50,
        0,
      )) {
        const u = String(c.get('vendedor_user') || '')
        if (u !== '') {
          if (!numsPorUser[u]) numsPorUser[u] = []
          numsPorUser[u].push(String(c.get('nome_exibicao') || c.get('numero') || ''))
        }
      }
    } catch (e1) {}

    for (const u of users) {
      const email = String(u.get('email') || '')
      const nomeU = String(u.get('name') || '')
      // conta de teste não é pessoa da equipe: sai da conta inteira
      if (email.toLowerCase().indexOf('fixture') >= 0) continue
      if (nomeU.toLowerCase().indexOf('fixture') >= 0) continue
      // só conta DEPOIS de descartar teste — antes somava fixture e o total mentia
      out.total_pessoas++

      // grants ativos
      var papeis = []
      var acoes = 0
      var ativa = false
      try {
        const gs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('access_grants'),
          "user_id='" + u.id + "' && revoked_at=''",
          '',
          30,
          0,
        )
        for (const g of gs) {
          const de = String(g.get('valid_from') || '')
          const ate = String(g.get('valid_until') || '')
          if (de !== '' && de.slice(0, 10) > hoje) continue
          if (ate !== '' && ate.slice(0, 10) < hoje) continue
          ativa = true
          const p = String(g.get('role') || '')
          if (p !== '' && papeis.indexOf(p) < 0) papeis.push(p)
          acoes += lerL(g.get('actions')).length
        }
      } catch (e2) {}
      if (ativa) out.ativas++

      const cargo = papeis.length > 0 ? papeis.join(', ') : ''
      if (cargo === '') out.sem_cargo.push(String(u.get('name') || email))
      else out.por_cargo[cargo] = (out.por_cargo[cargo] || 0) + 1

      const nums = numsPorUser[u.id] || []
      if (nums.length > 0) out.numeros_com_dono += nums.length
      out.pessoas.push({
        nome: String(u.get('name') || email).slice(0, 40),
        cargo: cargo || '(sem cargo)',
        ativa: ativa,
        numeros: nums,
        acoes: acoes,
      })
    }

    // números ativos sem dono
    try {
      const cxs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "ativo=true && papel='vendedor'",
        '',
        50,
        0,
      )
      for (const c of cxs) {
        if (String(c.get('vendedor_user') || '') === '') out.numeros_sem_dono++
      }
    } catch (e3) {}

    out.pessoas.sort(function (a, b) {
      return String(a.nome).localeCompare(String(b.nome))
    })
    out.ok = out.sem_cargo.length === 0 && out.numeros_sem_dono === 0
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
