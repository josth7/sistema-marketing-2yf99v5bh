/// <reference path="../pb_data/types.d.ts" />
/**
 * TELA EQUIPE E ACESSOS — quem é quem, o que vê e por qual número (CA-3-30).
 *
 * Pedido do dono: ver a equipe e quem vê cada número.
 * Card do board: "Ver a equipe e quem vê cada número" (SPEC-3-006; CA-3-30).
 *
 * ROTAS (todas exigem `manage_access`):
 *
 *   GET /backend/v1/acessos/equipe
 *     Uma linha por pessoa, com:
 *       - nome, e-mail, papel (cargo)
 *       - quantos leads tem na carteira (carga ativa)
 *       - quantos números de WhatsApp ela vê (e quais)
 *       - quais módulos o menu libera
 *       - se está ativa, e se a senha é provisória
 *
 *   GET /backend/v1/acessos/por-numero
 *     A aba "Por número": cada número de WhatsApp com quem vê e quantos leads.
 *     É a pergunta inversa — "quem cuida desse número?".
 *
 * Regra de escopo igual à do resto do sistema: `scope_accounts` com `*` = vê
 * tudo; vazio = só o próprio. Papel NÃO dá acesso por si — quem dá são as
 * ações do grant.
 *
 * JSVM: helpers INLINE (função no topo quebra o arquivo inteiro — lição 03/11).
 */

// ==================== EQUIPE: uma linha por pessoa ====================
routerAdd(
  'GET',
  '/backend/v1/acessos/equipe',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    // ---------- helpers inline ----------
    function lerLista(raw) {
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

    const colG = $app.findCollectionByNameOrId('access_grants')
    const colU = $app.findCollectionByNameOrId('users')
    const colCx = $app.findCollectionByNameOrId('whatsapp_conexoes')
    const colL = $app.findCollectionByNameOrId('crm_leads')

    // quem pede tem manage_access?
    var souAdmin = false
    var meusGrants = []
    try {
      meusGrants = $app.findRecordsByFilter(
        colG,
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        50,
        0,
      )
    } catch (e0) {}
    for (const g of meusGrants) {
      const a = lerLista(g.get('actions'))
      if (a.indexOf('manage_access') >= 0) souAdmin = true
    }
    if (!souAdmin) return e.json(403, { ok: false, erro: 'só quem tem manage_access' })

    const hoje = new Date().toISOString().slice(0, 10)

    // ---------- grants ativos (com janela de validade) ----------
    var todosGrants = []
    try {
      todosGrants = $app.findRecordsByFilter(colG, "revoked_at=''", '', 500, 0)
    } catch (e1) {}

    // ---------- conexoes (numero -> quem ve) ----------
    var conexoes = []
    try {
      conexoes = $app.findRecordsByFilter(colCx, 'ativo=true', '', 100, 0)
    } catch (e2) {}

    // ---------- carga de leads por dono ----------
    var leads = []
    try {
      leads = $app.findRecordsByFilter(colL, 'fixture=false', '', 6000, 0)
    } catch (e3) {}
    const carga = {}
    for (const l of leads) {
      const ow = String(l.get('owner_id') || '')
      if (ow === '') continue
      const st = String(l.get('status') || 'entrada_lead')
      if (st === 'venda_realizada' || st === 'finalizado' || st === 'descartado') continue
      carga[ow] = (carga[ow] || 0) + 1
    }

    // ---------- catalogo de modulos (mesmo da sessao) ----------
    const catalogo = [
      { para: '/painel', categoria: 'Visão geral', rotulo: 'Painel', aceita: ['read_metrics'] },
      {
        para: '/leads',
        categoria: 'Vendas',
        rotulo: 'CRM',
        aceita: ['read_leads', 'read_metrics'],
      },
      {
        para: '/gestao-leads',
        categoria: 'Vendas',
        rotulo: 'Gestão de leads',
        aceita: ['read_metrics'],
      },
      {
        para: '/esperando',
        categoria: 'Vendas',
        rotulo: 'Conversas esperando',
        aceita: ['read_metrics'],
      },
      { para: '/conversas', categoria: 'Vendas', rotulo: 'Conversas', aceita: ['read_conversas'] },
      {
        para: '/criterios',
        categoria: 'Marketing',
        rotulo: 'Critérios',
        aceita: ['manage_criteria'],
      },
      { para: '/alertas', categoria: 'Marketing', rotulo: 'Alertas', aceita: ['read_alerts'] },
      {
        para: '/decisoes',
        categoria: 'Inteligência artificial',
        rotulo: 'Decisões',
        aceita: ['read_decisions'],
      },
      {
        para: '/relatorios',
        categoria: 'Inteligência artificial',
        rotulo: 'Relatórios',
        aceita: ['read_reports'],
      },
      {
        para: '/conversoes',
        categoria: 'Marketing',
        rotulo: 'Conversões',
        aceita: ['read_metrics'],
      },
      {
        para: '/caixa',
        categoria: 'Inteligência artificial',
        rotulo: 'Caixa',
        aceita: ['read_reports'],
      },
      {
        para: '/vendas-sem-valor',
        categoria: 'Vendas',
        rotulo: 'Vendas sem valor',
        aceita: ['manage_leads', 'read_leads'],
      },
      { para: '/recontato', categoria: 'Vendas', rotulo: 'Recontato', aceita: ['read_leads'] },
      {
        para: '/precisa-acao',
        categoria: 'Vendas',
        rotulo: 'Precisa de ação',
        aceita: ['manage_access', 'read_leads'],
      },
      {
        para: '/numeros',
        categoria: 'Administração',
        rotulo: 'Números',
        aceita: ['manage_whatsapp'],
      },
      {
        para: '/atendimento',
        categoria: 'Administração',
        rotulo: 'Atendimento',
        aceita: ['manage_atendimento'],
      },
      {
        para: '/concorrentes',
        categoria: 'Marketing',
        rotulo: 'Concorrentes',
        aceita: ['read_analyses'],
      },
      { para: '/analises', categoria: 'Marketing', rotulo: 'Análises', aceita: ['read_analyses'] },
      {
        para: '/saude-canal',
        categoria: 'Marketing',
        rotulo: 'Saúde do canal',
        aceita: ['read_metrics'],
      },
      {
        para: '/acessos',
        categoria: 'Administração',
        rotulo: 'Acessos',
        aceita: ['manage_access'],
      },
      {
        para: '/admin',
        categoria: 'Administração',
        rotulo: 'Administração',
        aceita: ['manage_access'],
      },
    ]

    // ---------- usuarios ----------
    var users = []
    try {
      users = $app.findRecordsByFilter(colU, '', 'email', 300, 0)
    } catch (e4) {
      return e.json(200, { ok: false, erro: 'não consegui listar usuários' })
    }

    const itens = []
    for (const u of users) {
      const email = String(u.get('email') || '')
      if (email === '') continue

      const papeis = []
      const pode = []
      var temTudo = false
      var vence = ''
      var provisoria = false
      for (const g of todosGrants) {
        if (String(g.get('user_id')) !== u.id) continue
        const de = String(g.get('valid_from') || '')
        const ate = String(g.get('valid_until') || '')
        if (de !== '' && de.slice(0, 10) > hoje) continue
        if (ate !== '' && ate.slice(0, 10) < hoje) continue
        const papel = String(g.get('role') || '')
        if (papel !== '' && papeis.indexOf(papel) < 0) papeis.push(papel)
        const acts = lerLista(g.get('actions'))
        for (const a of acts) {
          const s = String(a)
          if (pode.indexOf(s) < 0) pode.push(s)
        }
        const sa = lerLista(g.get('scope_accounts'))
        if (Array.isArray(sa) && sa.indexOf('*') >= 0) temTudo = true
        if (ate !== '' && vence === '') vence = ate.slice(0, 10)
      }

      // numeros que essa pessoa ve
      const numeros = []
      for (const c of conexoes) {
        const papelCx = String(c.get('papel') || '')
        if (papelCx === 'central') {
          // central: quem tem read_conversas vê a parte dele; gestão vê tudo
          if (pode.indexOf('read_conversas') < 0) continue
          if (temTudo) numeros.push(String(c.get('numero') || ''))
          continue
        }
        if (String(c.get('vendedor_user') || '') === u.id) {
          numeros.push(String(c.get('numero') || ''))
        }
      }

      // modulos
      const modulos = []
      for (const m of catalogo) {
        for (const ac of m.aceita) {
          if (pode.indexOf(ac) >= 0) {
            modulos.push(m.rotulo)
            break
          }
        }
      }

      // provisoria: a senha ainda é a do time?
      try {
        provisoria = u.validatePassword('Haisan@2026')
      } catch (eP) {
        provisoria = false
      }

      const ehFixture = email.toLowerCase().indexOf('fixture') >= 0
      itens.push({
        id: u.id,
        nome: String(u.get('name') || ''),
        email: email,
        papeis: papeis,
        cargo: papeis.length > 0 ? papeis.join(', ') : '(sem cargo)',
        acoes: pode.length,
        modo_escopo: temTudo ? 'todos' : 'próprio',
        modulos: modulos,
        numeros: numeros,
        leads_ativos: carga[u.id] || 0,
        ativa: pode.length > 0,
        vence_em: vence,
        senha_provisoria: provisoria,
        conta_teste: ehFixture,
      })
    }

    // ordena: com acesso primeiro, depois por carga
    itens.sort(function (a, b) {
      if (a.ativa !== b.ativa) return a.ativa ? -1 : 1
      return (b.leads_ativos || 0) - (a.leads_ativos || 0)
    })

    var ativas = 0
    for (const it of itens) if (it.ativa) ativas++

    return e.json(200, {
      ok: true,
      total: itens.length,
      ativas: ativas,
      itens: itens,
    })
  },
  $apis.requireAuth(),
)

// ==================== POR NÚMERO: quem cuida de cada número ====================
routerAdd(
  'GET',
  '/backend/v1/acessos/por-numero',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    function lerLista2(raw) {
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

    const colG = $app.findCollectionByNameOrId('access_grants')
    const colU = $app.findCollectionByNameOrId('users')
    const colCx = $app.findCollectionByNameOrId('whatsapp_conexoes')
    const colCv = $app.findCollectionByNameOrId('whatsapp_conversas')
    const colL = $app.findCollectionByNameOrId('crm_leads')

    // guard
    var souAdmin = false
    try {
      const meus = $app.findRecordsByFilter(
        colG,
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        50,
        0,
      )
      for (const g of meus) {
        const a = lerLista2(g.get('actions'))
        if (a.indexOf('manage_access') >= 0) souAdmin = true
      }
    } catch (e0) {}
    if (!souAdmin) return e.json(403, { ok: false, erro: 'só quem tem manage_access' })

    // quem tem read_conversas / escopo total
    var grants = []
    try {
      grants = $app.findRecordsByFilter(colG, "revoked_at=''", '', 500, 0)
    } catch (e1) {}

    const veTotal = {}
    const veProprio = {}
    for (const g of grants) {
      const uid = String(g.get('user_id') || '')
      if (uid === '') continue
      const acts = lerLista2(g.get('actions'))
      if (acts.indexOf('read_conversas') < 0) continue
      const sa = lerLista2(g.get('scope_accounts'))
      if (Array.isArray(sa) && sa.indexOf('*') >= 0) veTotal[uid] = true
      else veProprio[uid] = true
    }

    var users = []
    try {
      users = $app.findRecordsByFilter(colU, '', 'email', 300, 0)
    } catch (e2) {}
    const nomePorId = {}
    const emailPorId = {}
    for (const u of users) {
      nomePorId[u.id] = String(u.get('name') || u.get('email') || '')
      emailPorId[u.id] = String(u.get('email') || '')
    }

    var conexoes = []
    try {
      conexoes = $app.findRecordsByFilter(colCx, 'ativo=true', '', 100, 0)
    } catch (e3) {}

    var conversas = []
    try {
      conversas = $app.findRecordsByFilter(colCv, 'fixture=false', '', 2000, 0)
    } catch (e4) {}
    const porConexao = {}
    for (const c of conversas) {
      const cx = String(c.get('conexao') || '')
      porConexao[cx] = (porConexao[cx] || 0) + 1
    }

    const itens = []
    for (const c of conexoes) {
      const id = c.id
      const papel = String(c.get('papel') || '')
      const vendedorUser = String(c.get('vendedor_user') || '')
      var veem = []
      if (papel === 'central') {
        // na central, a gestao ve tudo; o vendedor ve a parte dos leads dele
        for (const uid in veTotal) veem.push(nomePorId[uid] || emailPorId[uid] || uid)
        const vendedores = Object.keys(veProprio).length
        if (vendedores > 0) {
          veem.push('+ ' + vendedores + ' vendedor(es), só os leads deles')
        }
      } else if (vendedorUser !== '') {
        veem.push(nomePorId[vendedorUser] || emailPorId[vendedorUser] || vendedorUser)
        for (const uid in veTotal) {
          const n = nomePorId[uid] || emailPorId[uid] || uid
          if (veem.indexOf(n) < 0) veem.push(n + ' (gestão)')
        }
      }
      itens.push({
        id: id,
        numero: String(c.get('numero') || ''),
        nome: String(c.get('nome_exibicao') || ''),
        papel: papel,
        vendedor: vendedorUser !== '' ? nomePorId[vendedorUser] || vendedorUser : '',
        quem_ve: veem,
        conversas: porConexao[id] || 0,
        ativo: c.get('ativo') === true,
      })
    }
    itens.sort(function (a, b) {
      if (a.papel !== b.papel) return a.papel === 'central' ? -1 : 1
      return (b.conversas || 0) - (a.conversas || 0)
    })

    return e.json(200, { ok: true, total: itens.length, itens: itens })
  },
  $apis.requireAuth(),
)
