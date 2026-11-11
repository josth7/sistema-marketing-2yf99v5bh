/// <reference path="../pb_data/types.d.ts" />
/**
 * DISPARO DA CAMPANHA EM LOTES — CA-3-54 (SPEC-3-012, 06/11).
 *
 * **A decisão do dono (06/11):** campanha só envia entre **7h e 20h**
 * (Brasília). Fora disso, espera o próximo dia.
 *
 * **As regras (RN-152):**
 *   - o cron roda a cada 10 min e manda `floor(ritmo_hora/6)` por rodada;
 *   - nunca passa de `ritmo_hora` nos últimos 60 min;
 *   - nunca passa de `teto_dia` nas últimas 24 h **por número** (orçamento
 *     único: campanha + apresentação + recontato);
 *   - pausar para **na hora**; retomar continua de onde parou;
 *   - fora da janela ou do dia válido, espera.
 *
 * **Proteção do número (RN-154):** 10% ou mais de recusa nos últimos 50
 * envios → pausa automática. É o que impede o número de ser bloqueado de vez.
 *
 * **Opt-out (RN-153):** quem pediu para sair nunca mais entra. Vale para todas
 * as campanhas, não só a atual.
 *
 * Rotas:
 *   POST /backend/v1/campanhas/{id}/iniciar  → monta os destinos e começa
 *   GET  /backend/v1/campanhas/{id}/resultado → contagens e recusas
 *
 * JSVM: helpers INLINE; sem função no topo.
 */

// ==================== INICIAR ====================
routerAdd(
  'POST',
  '/backend/v1/campanhas/{id}/iniciar',
  (e) => {
    // ---------- empresa ativa (CA-3-88) ----------
    // Lê os grants AQUI, no escopo da rota: `const meus` de dentro de um try
    // não existe fora dele (lança, o catch engole, o 403 não dispara).
    var empresaAtiva = ''
    try {
      var pedidaW = String(e.request.header.get('X-Empresa') || '')
      var gsW = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      var empGrantW = []
      var ehDonoW = false
      for (const gW of gsW) {
        var empGW = ''
        try {
          empGW = String(gW.get('empresa') || '')
        } catch (eGW) {}
        if (empGW !== '' && empGrantW.indexOf(empGW) < 0) empGrantW.push(empGW)
        var saW = []
        try {
          var rawW = gW.get('scope_accounts')
          saW =
            Array.isArray(rawW) && rawW.length > 0 && typeof rawW[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawW))
              : typeof rawW === 'string'
                ? JSON.parse(rawW)
                : rawW || []
        } catch (eSAW) {}
        if (Array.isArray(saW) && saW.indexOf('*') >= 0) ehDonoW = true
      }
      if (pedidaW !== '') {
        if (!ehDonoW && empGrantW.indexOf(pedidaW) < 0) {
          return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
        }
        empresaAtiva = pedidaW
      } else if (empGrantW.length > 0) {
        empresaAtiva = empGrantW[0]
      } else {
        const esW = $app.findRecordsByFilter('empresas', 'ativa=true', '', 1, 0)
        if (esW.length > 0) empresaAtiva = esW[0].id
      }
    } catch (eEmpW) {}

    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    const app = $app
    const hoje = new Date().toISOString().slice(0, 10)

    // gestão
    var ehGestao = false
    try {
      const meus = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      for (const g of meus) {
        const ate = String(g.get('valid_until') || '')
        if (ate !== '' && ate.slice(0, 10) < hoje) continue
        var esc = []
        try {
          const rawE = g.get('scope_accounts')
          esc =
            Array.isArray(rawE) && rawE.length > 0 && typeof rawE[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawE))
              : typeof rawE === 'string'
                ? JSON.parse(rawE)
                : rawE || []
        } catch (eE) {}
        if (Array.isArray(esc) && esc.indexOf('*') >= 0) ehGestao = true
      }
    } catch (e0) {}
    if (!ehGestao) return e.json(403, { ok: false, erro: 'só a gestão inicia campanha' })

    var camp = null
    try {
      camp = app.findRecordById('campanhas', String(e.request.pathValue('id') || ''))
    } catch (e1) {
      return e.json(404, { ok: false, erro: 'campanha não encontrada' })
    }

    // RN-151: só aprovada, com modelo e conexão ativa
    if (
      String(camp.get('estado') || '') !== 'aprovada' &&
      String(camp.get('estado') || '') !== 'pausada'
    ) {
      return e.json(409, {
        ok: false,
        erro: 'a campanha precisa estar aprovada',
        estado: String(camp.get('estado') || ''),
      })
    }
    if (String(camp.get('modelo_nome') || '') === '') {
      return e.json(422, { ok: false, erro: 'campanha sem modelo aprovado' })
    }
    var conexao = null
    try {
      conexao = app.findRecordById('whatsapp_conexoes', String(camp.get('conexao') || ''))
    } catch (e2) {}
    if (!conexao || conexao.get('ativo') !== true) {
      return e.json(422, { ok: false, erro: 'a conexão da campanha não está ativa' })
    }

    // ---------- monta a base (RN-150) ----------
    const fora = {}
    try {
      for (const o of $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('opt_out'),
        '',
        '',
        20000,
        0,
      )) {
        fora[String(o.get('telefone') || '').replace(/\D/g, '')] = true
      }
    } catch (e3) {}

    const internos = {}
    try {
      // A lista de números internos mora em `whatsapp_numeros_internos`.
      // `atendimento_config.internos` é campo VIRTUAL: no registro cru vem
      // nulo, e ler dali fazia a exclusão de número interno não funcionar.
      const is = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_numeros_internos'),
        '',
        '',
        300,
        0,
      )
      for (const i of is) {
        const n = String(i.get('numero') || '').replace(/[^0-9]/g, '')
        if (n === '') continue
        internos[n] = true
        if (n.length === 13) internos[n.slice(0, 4) + n.slice(5)] = true
        if (n.length === 12) internos[n.slice(0, 4) + '9' + n.slice(4)] = true
      }
    } catch (e2) {}

    var leads = []
    try {
      leads = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '',
        8000,
        0,
      )
    } catch (e5) {
      return e.json(500, { ok: false, erro: 'não consegui montar a base' })
    }

    const colDest = app.findCollectionByNameOrId('campanha_destinos')
    const vistos = {}
    var criados = 0
    for (const l of leads) {
      const tel = String(l.get('telefone') || '').replace(/\D/g, '')
      if (tel === '') continue
      if (fora[tel]) continue
      if (internos[tel]) continue
      if (vistos[tel]) continue
      vistos[tel] = true
      const chave = String(camp.id) + '|' + tel
      try {
        const ja = app.findRecordsByFilter(colDest, "dedupe_key='" + chave + "'", '', 1, 0)
        if (ja && ja.length > 0) continue
      } catch (e6) {}
      try {
        const d = new Record(colDest)
        d.set('campanha', camp.id)
        d.set('telefone', tel)
        d.set('nome', String(l.get('nome') || '').slice(0, 200))
        d.set('estado', 'na_fila')
        d.set('fixture', false)
        d.set('dedupe_key', chave)
        app.save(d)
        criados++
      } catch (e7) {}
    }

    try {
      camp.set('estado', 'em_andamento')
      app.save(camp)
    } catch (e8) {}

    return e.json(200, {
      ok: true,
      id: camp.id,
      estado: 'em_andamento',
      destinos_na_fila: criados,
      janela:
        String(camp.get('hora_inicio') || '07:00') +
        ' - ' +
        String(camp.get('hora_fim') || '20:00'),
      aviso: 'o envio acontece de 10 em 10 minutos; fora da janela espera o dia seguinte',
    })
  },
  $apis.requireAuth(),
)

// ==================== RESULTADO ====================
routerAdd(
  'GET',
  '/backend/v1/campanhas/{id}/resultado',
  (e) => {
    // ---------- empresa ativa (CA-3-88) ----------
    // Lê os grants AQUI, no escopo da rota: `const meus` de dentro de um try
    // não existe fora dele (lança, o catch engole, o 403 não dispara).
    var empresaAtiva = ''
    try {
      var pedidaW = String(e.request.header.get('X-Empresa') || '')
      var gsW = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      var empGrantW = []
      var ehDonoW = false
      for (const gW of gsW) {
        var empGW = ''
        try {
          empGW = String(gW.get('empresa') || '')
        } catch (eGW) {}
        if (empGW !== '' && empGrantW.indexOf(empGW) < 0) empGrantW.push(empGW)
        var saW = []
        try {
          var rawW = gW.get('scope_accounts')
          saW =
            Array.isArray(rawW) && rawW.length > 0 && typeof rawW[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawW))
              : typeof rawW === 'string'
                ? JSON.parse(rawW)
                : rawW || []
        } catch (eSAW) {}
        if (Array.isArray(saW) && saW.indexOf('*') >= 0) ehDonoW = true
      }
      if (pedidaW !== '') {
        if (!ehDonoW && empGrantW.indexOf(pedidaW) < 0) {
          return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
        }
        empresaAtiva = pedidaW
      } else if (empGrantW.length > 0) {
        empresaAtiva = empGrantW[0]
      } else {
        const esW = $app.findRecordsByFilter('empresas', 'ativa=true', '', 1, 0)
        if (esW.length > 0) empresaAtiva = esW[0].id
      }
    } catch (eEmpW) {}

    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    const out = { ok: true, por_estado: {}, total: 0, recusas: [] }
    var ds = []
    try {
      ds = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('campanha_destinos'),
        "campanha='" + String(e.request.pathValue('id') || '') + "'",
        '',
        20000,
        0,
      )
    } catch (e0) {
      out.ok = false
      out.erro = String(e0).slice(0, 140)
      return e.json(200, out)
    }
    const recusas = {}
    for (const d of ds) {
      const est = String(d.get('estado') || '(vazio)')
      out.por_estado[est] = (out.por_estado[est] || 0) + 1
      const er = String(d.get('erro') || '')
      if (er !== '') recusas[er] = (recusas[er] || 0) + 1
    }
    out.total = ds.length
    const pares = []
    for (const k in recusas) pares.push({ codigo: k, vezes: recusas[k] })
    pares.sort(function (a, b) {
      return b.vezes - a.vezes
    })
    out.recusas = pares.slice(0, 5)
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
