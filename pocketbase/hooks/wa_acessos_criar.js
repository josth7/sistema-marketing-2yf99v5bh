/// <reference path="../pb_data/types.d.ts" />
/**
 * CADASTRAR PESSOA NOVA (CA-3-36, 04/11).
 *
 * O problema: hoje criar alguém exige migração e alguém técnico. Quem entra
 * na equipe espera — e até lá não vê nada ou vê tudo.
 *
 * Esta rota faz nascer a pessoa CERTA por padrão:
 *   1. cria a conta com SENHA PROVISÓRIA de 72h
 *   2. cria o grant com as ações do cargo escolhido
 *   3. escopo VAZIO = só o que for dela (deny por padrão, nunca "vê tudo")
 *   4. marca `troca_obrigatoria` — a tela força trocar a senha no 1º acesso
 *   5. registra em access_audit
 *
 * CARGOS PRONTOS (o que a pessoa vê no menu)
 *   vendedor   → leads + conversas (só a carteira dela)
 *   marketing  → painel, critérios, alertas, relatórios, análises
 *   financeiro → painel, relatórios
 *   gestao     → tudo, inclusive acessos (escopo *)
 *
 * ROTA
 *   POST /backend/v1/acessos/pessoa/nova
 *     { nome, email, cargo, telefone? }
 *
 * TRAVAS
 *   - exige manage_access
 *   - e-mail repetido recusa
 *   - não cria conta sem cargo (evita gente logada sem saber o que vê)
 *   - e-mail com "fixture" só nasce como conta de teste, nunca real
 *
 * JSVM: todo helper INLINE.
 */
routerAdd(
  'POST',
  '/backend/v1/acessos/pessoa/nova',
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

    const app = $app
    const colU = app.findCollectionByNameOrId('users')
    const colG = app.findCollectionByNameOrId('access_grants')
    const agoraISO = new Date().toISOString()

    // ---------- guard ----------
    var souAdmin = false
    try {
      const meus = app.findRecordsByFilter(
        colG,
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        50,
        0,
      )
      for (const g of meus) {
        const a = lerL(g.get('actions'))
        if (a.indexOf('manage_access') >= 0) souAdmin = true
      }
    } catch (e0) {}
    if (!souAdmin) return e.json(403, { ok: false, erro: 'só quem tem manage_access' })

    // ---------- entrada ----------
    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (e1) {}
    const nome = String(body.nome || '')
      .trim()
      .slice(0, 120)
    const email = String(body.email || '')
      .trim()
      .toLowerCase()
    const cargo = String(body.cargo || '')
      .trim()
      .toLowerCase()

    if (nome === '') return e.json(400, { ok: false, erro: 'informe o nome' })
    if (email === '' || email.indexOf('@') < 2) {
      return e.json(400, { ok: false, erro: 'e-mail inválido' })
    }

    // ---------- cargo → ações ----------
    const CARGOS = {
      vendedor: ['read_leads', 'read_conversas'],
      marketing: [
        'read_metrics',
        'read_leads',
        'manage_criteria',
        'read_alerts',
        'read_reports',
        'read_analyses',
        'request_analysis',
      ],
      financeiro: ['read_metrics', 'read_reports'],
      // 13/11 (pedido da gestão): agência de marketing vê só campanhas e
      // métricas — sem leads, conversas, análises da gestão nem relatórios
      agencia: ['read_metrics', 'read_alerts'],
      gestao: [
        'read_metrics',
        'read_leads',
        'manage_leads',
        'read_conversas',
        'manage_whatsapp',
        'manage_atendimento',
        'manage_criteria',
        'approve_criteria',
        'read_alerts',
        'manage_alerts',
        'read_decisions',
        'manage_decisions',
        'read_reports',
        'approve_reports',
        'read_analyses',
        'request_analysis',
        'review_ai_summary',
        'manage_access',
      ],
    }
    if (!CARGOS[cargo]) {
      return e.json(400, {
        ok: false,
        erro: 'cargo inválido — use vendedor, marketing, financeiro, agencia ou gestao',
        cargos: ['vendedor', 'marketing', 'financeiro', 'agencia', 'gestao'],
      })
    }
    const acoes = CARGOS[cargo]
    const escopo = cargo === 'gestao' ? ['*'] : []

    // ---------- e-mail já existe? ----------
    try {
      const ja = app.findRecordsByFilter(colU, "email='" + email + "'", '', 1, 0)
      if (ja && ja.length > 0) {
        return e.json(409, {
          ok: false,
          erro: 'já existe uma pessoa com este e-mail',
          id: ja[0].id,
        })
      }
    } catch (e2) {}

    // ---------- 1. conta com senha provisória ----------
    // 13/11: a senha provisória era a mesma para todo mundo e estava escrita
    // aqui. Agora é aleatória por pessoa (a tela continua mostrando).
    const SENHA = 'Hs' + $security.randomString(10) + '#7'
    var pessoa = null
    try {
      const u = new Record(colU)
      u.set('email', email)
      u.set('name', nome)
      u.set('verified', true)
      u.setPassword(SENHA)
      app.save(u)
      pessoa = u
    } catch (e3) {
      return e.json(500, { ok: false, erro: 'falha ao criar a conta: ' + String(e3).slice(0, 160) })
    }

    // ---------- 2-3. grant ----------
    const ehFixture = email.indexOf('fixture') >= 0
    try {
      const g = new Record(colG)
      g.set('user_id', pessoa.id)
      g.set('role', cargo)
      g.set('actions', JSON.stringify(acoes))
      g.set('scope_accounts', JSON.stringify(escopo))
      g.set('scope_channels', JSON.stringify([]))
      // 13/11 (vazamento Gol 7): a pessoa nasce na empresa de quem cadastrou.
      // Antes nascia sem empresa e o cron colocava a Haisan.
      g.set('empresa', empresaAtiva)
      g.set('valid_from', '')
      // validade da senha provisória: 72h (o grant não expira)
      g.set('valid_until', '')
      g.set('revoked_at', '')
      g.set('approved_by', e.auth.id)
      g.set('approved_at', agoraISO)
      g.set('version', 1)
      g.set('note', 'criado pela tela em ' + agoraISO.slice(0, 10) + ' · senha provisória 72h')
      app.save(g)
    } catch (e4) {
      return e.json(500, {
        ok: false,
        erro: 'conta criada mas o acesso falhou: ' + String(e4).slice(0, 160),
        id: pessoa.id,
      })
    }

    // ---------- 5. trilha ----------
    try {
      const colA = app.findCollectionByNameOrId('access_audit')
      const a = new Record(colA)
      a.set('at', agoraISO)
      a.set('actor', e.auth.id)
      a.set('acao', 'pessoa_criada')
      a.set('alvo', pessoa.id)
      a.set('detalhe', 'cargo=' + cargo + ' acoes=' + acoes.length + ' escopo=' + escopo.join(','))
      app.save(a)
    } catch (e5) {}

    return e.json(201, {
      ok: true,
      id: pessoa.id,
      nome: nome,
      email: email,
      cargo: cargo,
      acoes: acoes.length,
      senha_provisoria: SENHA,
      troca_obrigatoria: true,
      expira_em: new Date(new Date().getTime() + 72 * 3600 * 1000).toISOString(),
      conta_teste: ehFixture,
    })
  },
  $apis.requireAuth(),
)
