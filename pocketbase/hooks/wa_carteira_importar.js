/// <reference path="../pb_data/types.d.ts" />
/**
 * IMPORTAR CONTATOS — aba por vendedor (CA-3-78, SPEC-3-013, 05/11).
 *
 * **O arquivo real:** a Haisan mandou planilhas em XLSX, uma **aba por
 * vendedor** (Adriana, Douglas, Fabio, Elisangela), mais uma aba **Resumo**
 * que NÃO é de ninguém e deve ser ignorada.
 *
 * **As regras (CA-3-78, palavra por palavra):**
 *   - cada aba vai para o vendedor do nome da aba, **sem acento** (Fabio →
 *     Fábio, Elisangela → Elisângela);
 *   - a aba **Resumo é ignorada**, com motivo registrado;
 *   - telefone **sem DDD** recebe o DDD do número daquele vendedor e fica
 *     marcado como **"DDD presumido"**;
 *   - telefone que aparece em **mais de uma aba** vira **conflito** — o
 *     sistema NÃO escolhe sozinho;
 *   - reimportar **não duplica**.
 *
 * **Por que conflito não escolhe sozinho:** o mesmo cliente na carteira de
 * duas vendedoras é briga comercial. Quem decide é a gestão, não o importador.
 *
 * Rotas:
 *   POST /backend/v1/carteira/importar  { linhas: [{nome, telefone, aba}], lote }
 *   GET  /backend/v1/carteira/importacao/ultima
 *
 * JSVM: helpers INLINE; nada de função no topo.
 */
routerAdd(
  'POST',
  '/backend/v1/carteira/importar',
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
    const out = {
      ok: true,
      gravados: 0,
      repetidos: 0,
      sem_telefone: 0,
      sem_vendedor: 0,
      resumo_ignorado: 0,
      ddd_presumido: 0,
      conflitos: 0,
      por_aba: {},
      abas_ignoradas: [],
      detalhe_conflitos: [],
    }

    // ---------- permissão: só gestão importa ----------
    var pode = false
    var hoje = new Date().toISOString().slice(0, 10)
    try {
      const meus = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      for (const g of meus) {
        const de = String(g.get('valid_from') || '')
        const ate = String(g.get('valid_until') || '')
        if (de !== '' && de.slice(0, 10) > hoje) continue
        if (ate !== '' && ate.slice(0, 10) < hoje) continue
        var atos = []
        var escopo = []
        try {
          const rawA = g.get('actions')
          atos =
            Array.isArray(rawA) && rawA.length > 0 && typeof rawA[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawA))
              : typeof rawA === 'string'
                ? JSON.parse(rawA)
                : rawA || []
        } catch (eA) {}
        try {
          const rawE = g.get('scope_accounts')
          escopo =
            Array.isArray(rawE) && rawE.length > 0 && typeof rawE[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawE))
              : typeof rawE === 'string'
                ? JSON.parse(rawE)
                : rawE || []
        } catch (eE) {}
        if (Array.isArray(escopo) && escopo.indexOf('*') >= 0) pode = true
        if (Array.isArray(atos) && atos.indexOf('manage_leads') >= 0) pode = true
      }
    } catch (e0) {}
    if (!pode) return e.json(403, { ok: false, erro: 'só a gestão importa contatos' })

    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {}
    const linhas = Array.isArray(body.linhas) ? body.linhas : []
    if (linhas.length === 0) {
      return e.json(422, { ok: false, erro: 'envie {linhas:[{nome, telefone, aba}]}' })
    }
    const lote = String(body.lote || 'imp-' + String(new Date().getTime())).slice(0, 40)

    // ---------- vendedores e o DDD do número deles ----------
    // nome sem acento -> {user, ddd}
    const mapaVend = {}
    try {
      const cxs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='vendedor' && ativo=true",
        '',
        30,
        0,
      )
      for (const c of cxs) {
        const nomeV = String(c.get('nome_exibicao') || '')
        const num = String(c.get('numero') || '').replace(/\D/g, '')
        const ddd = num.length >= 10 ? num.slice(2, 4) : ''
        const chave = nomeV
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .trim()
        const entrada = {
          user: String(c.get('vendedor_user') || ''),
          nome: nomeV,
          ddd: ddd,
          conexao: c.id,
        }
        // A aba da planilha traz só o PRIMEIRO nome ("Fabio"), e a conexão
        // traz o nome completo ("Fábio Teles"). Guarda as duas chaves, senão
        // nenhuma aba casa e a importação grava zero (aconteceu na 1ª prova).
        mapaVend[chave] = entrada
        const primeiro = chave.split(' ')[0]
        if (primeiro !== '' && !mapaVend[primeiro]) mapaVend[primeiro] = entrada
      }
    } catch (e1) {}

    function normalizaNome(t) {
      return String(t || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
    }

    // ---------- 1ª passada: normaliza e acha telefone repetido entre abas ----------
    const porTelefone = {}
    const prontas = []
    for (const l of linhas) {
      const aba = String(l.aba || '').trim()
      const abaNorm = normalizaNome(aba)
      // aba Resumo (ou parecida) não é de vendedor
      if (abaNorm === 'resumo' || abaNorm.indexOf('resumo') === 0) {
        out.resumo_ignorado++
        if (out.abas_ignoradas.indexOf(aba) < 0) out.abas_ignoradas.push(aba)
        continue
      }
      const vend = mapaVend[abaNorm]
      if (!vend || vend.user === '') {
        out.sem_vendedor++
        if (out.abas_ignoradas.indexOf(aba) < 0) out.abas_ignoradas.push(aba)
        continue
      }
      var tel = String(l.telefone || '').replace(/\D/g, '')
      if (tel === '') {
        out.sem_telefone++
        continue
      }
      var dddPresumido = false
      // sem DDD: 8 ou 9 dígitos (número local)
      if ((tel.length === 8 || tel.length === 9) && vend.ddd !== '') {
        tel = vend.ddd + tel
        dddPresumido = true
      }
      if (tel.length === 10 || tel.length === 11) tel = '55' + tel
      if (tel.length < 12 || tel.length > 15) {
        out.sem_telefone++
        continue
      }
      if (dddPresumido) out.ddd_presumido++
      if (!porTelefone[tel]) porTelefone[tel] = []
      porTelefone[tel].push({
        aba: aba,
        abaNorm: abaNorm,
        nome: String(l.nome || '').slice(0, 200),
      })
      prontas.push({
        tel: tel,
        nome: String(l.nome || '')
          .trim()
          .slice(0, 200),
        vend: vend,
        aba: aba,
        dddPresumido: dddPresumido,
      })
    }

    // ---------- telefone em mais de uma aba = conflito ----------
    const conflitantes = {}
    for (const tel in porTelefone) {
      const abas = {}
      for (const x of porTelefone[tel]) abas[x.abaNorm] = true
      if (Object.keys(abas).length > 1) {
        conflitantes[tel] = Object.keys(abas)
        out.conflitos++
        if (out.detalhe_conflitos.length < 20) {
          out.detalhe_conflitos.push({ telefone: tel, abas: Object.keys(abas) })
        }
      }
    }

    // ---------- gravação ----------
    const colCart = app.findCollectionByNameOrId('carteira_contatos')
    const lotes = {}
    for (const p of prontas) {
      const chave = String(p.vend.conexao) + '|' + p.tel
      // reimportar não duplica
      try {
        const ja = app.findRecordsByFilter(colCart, "dedupe_key='" + chave + "'", '', 1, 0)
        if (ja && ja.length > 0) {
          out.repetidos++
          continue
        }
      } catch (e2) {}
      try {
        const r = new Record(colCart)
        r.set('telefone', p.tel)
        r.set('nome', p.nome)
        r.set('conexao', String(p.vend.conexao))
        r.set('vendedor_user', String(p.vend.user))
        // origem marca o DDD presumido, como o CA exige
        r.set('origem_carteira', p.dddPresumido ? 'importacao_ddd_presumido' : 'importacao')
        r.set('lote', lote)
        r.set('fixture', false)
        r.set('dedupe_key', chave)
        app.save(r)
        out.gravados++
        const k = String(p.vend.nome || p.aba)
        out.por_aba[k] = (out.por_aba[k] || 0) + 1
      } catch (e3) {
        out.sem_telefone++
      }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)

// ==================== ÚLTIMA IMPORTAÇÃO ====================
routerAdd(
  'GET',
  '/backend/v1/carteira/importacao/ultima',
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

    const out = { ok: true, lotes: [], total: 0 }
    var conts = []
    try {
      conts = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('carteira_contatos'),
        'fixture=false',
        '',
        4000,
        0,
      )
    } catch (e0) {
      out.ok = false
      out.erro = String(e0).slice(0, 140)
      return e.json(200, out)
    }
    const porLote = {}
    for (const c of conts) {
      const l = String(c.get('lote') || '(sem lote)')
      porLote[l] = (porLote[l] || 0) + 1
    }
    for (const k in porLote) out.lotes.push({ lote: k, contatos: porLote[k] })
    out.lotes.sort(function (a, b) {
      return String(b.lote).localeCompare(String(a.lote))
    })
    out.total = conts.length
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
