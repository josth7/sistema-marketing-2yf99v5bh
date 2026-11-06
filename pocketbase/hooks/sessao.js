/// <reference path="../pb_data/types.d.ts" />
/**
 * Sessão e permissões — alimenta o login da interface (30/10).
 *
 * GET /backend/v1/wa/sessao
 *   { autenticado, user, papeis, pode[], menu[], provisoria }
 *
 * `pode` é a soma das ações de todos os grants válidos do usuário — é
 * exatamente o que a interface deve mostrar. Quem não tem a ação não vê a
 * aba (e o servidor recusa a rota de qualquer forma).
 *
 * CORREÇÃO (30/10, v2): cada módulo declara uma LISTA de ações aceitas (OR).
 * A v1 mapeou o CRM (tela Leads) para `read_metrics`, e o vendedor tem
 * `read_leads` — resultado: o CRM não aparecia para o vendedor, que é
 * justamente quem mais precisa dele. Agora `/leads` aceita `read_leads` OU
 * `read_metrics`.
 */

routerAdd(
  'GET',
  '/backend/v1/wa/sessao',
  (e) => {
    if (!e.auth)
      return e.json(401, { ok: false, autenticado: false, erro: 'entre com seu e-mail e senha' })

    const eu = $app.findRecordById('users', e.auth.id)
    const hoje = new Date().toISOString().slice(0, 10)

    // parser tolerante: json pode voltar como array de char-codes no JSVM
    function lista(raw) {
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
    var meus = []
    try {
      meus = $app.findRecordsByFilter(
        colG,
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '-created',
        50,
        0,
      )
    } catch (errG) {
      meus = []
    }

    const pode = []
    const papeis = []
    for (const g of meus) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
      if (ate !== '' && ate.slice(0, 10) < hoje) continue
      const papel = String(g.get('role') || '')
      if (papel !== '' && papeis.indexOf(papel) < 0) papeis.push(papel)
      const acts = lista(g.get('actions'))
      for (const a of acts) {
        const s = String(a)
        if (pode.indexOf(s) < 0) pode.push(s)
      }
    }

    // cada módulo: QUALQUER uma das ações listadas libera (OR)
    const catalogo = [
      { para: '/painel', categoria: 'Visão geral', rotulo: 'Painel', aceita: ['read_metrics'] },
      {
        para: '/leads',
        categoria: 'Vendas',
        rotulo: 'CRM',
        aceita: ['read_leads', 'read_metrics'],
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
    ]

    const menu = []
    for (const item of catalogo) {
      var liberado = false
      for (const acao of item.aceita) {
        if (pode.indexOf(acao) >= 0) liberado = true
      }
      if (liberado)
        menu.push({ para: item.para, rotulo: item.rotulo, categoria: item.categoria || '' })
    }

    return e.json(200, {
      ok: true,
      autenticado: true,
      v: 'sessao-v2',
      user: {
        id: e.auth.id,
        nome: String(eu.get('name') || eu.get('email') || ''),
        email: String(eu.get('email') || ''),
      },
      papeis: papeis,
      pode: pode,
      menu: menu,
      provisoria: (function () {
        try {
          return eu.validatePassword('Haisan@2026')
        } catch (errP) {
          return false
        }
      })(),
    })
  },
  $apis.requireAuth(),
)
