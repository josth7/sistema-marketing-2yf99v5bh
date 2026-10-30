/// <reference path="../pb_data/types.d.ts" />
/**
 * Sessão e permissões — alimenta o login da interface (30/10).
 *
 * PROBLEMA QUE RESOLVE: a tela inicial era pública e o painel abria sem
 * login; o pedido de senha só aparecia ao clicar nas abas, uma a uma. E o
 * menu mostrava módulos que a pessoa não podia usar.
 *
 * GET /backend/v1/wa/sessao
 *   { autenticado: true, user: {id,nome,email}, pode: [...], menu: [...] }
 *
 * `pode` é a INTERSEÇÃO de todas as ações dos grants válidos do usuário —
 * é exatamente o que a interface deve mostrar. Quem não tem a ação não vê a
 * aba (e o servidor recusa a rota de qualquer forma; a interface só evita
 * oferecer o que vai dar erro).
 *
 * Regra de escopo: grant com scope_accounts vazio NÃO vale para ações de
 * carteira (deny por padrão) — exceto para papéis de gestão, que já vêm
 * com escopo '*' no cadastro.
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

    // menu: cada módulo só aparece se a ação que ele precisa estiver em `pode`
    const catalogo = [
      { para: '/painel', rotulo: 'Painel', exige: 'read_metrics' },
      { para: '/criterios', rotulo: 'Critérios', exige: 'manage_criteria' },
      { para: '/alertas', rotulo: 'Alertas', exige: 'read_alerts' },
      { para: '/decisoes', rotulo: 'Decisões', exige: 'read_decisions' },
      { para: '/relatorios', rotulo: 'Relatórios', exige: 'read_reports' },
      { para: '/caixa', rotulo: 'Caixa', exige: 'read_reports' },
      { para: '/leads', rotulo: 'Leads', exige: 'read_metrics' },
      { para: '/conversas', rotulo: 'Conversas', exige: 'read_conversas' },
      { para: '/numeros', rotulo: 'Números', exige: 'manage_whatsapp' },
      { para: '/concorrentes', rotulo: 'Concorrentes', exige: 'read_analyses' },
      { para: '/analises', rotulo: 'Análises', exige: 'read_analyses' },
      { para: '/saude-canal', rotulo: 'Saúde do canal', exige: 'read_metrics' },
    ]

    const menu = []
    for (const item of catalogo) {
      if (pode.indexOf(item.exige) >= 0) menu.push({ para: item.para, rotulo: item.rotulo })
    }

    return e.json(200, {
      ok: true,
      autenticado: true,
      v: 'sessao-v1',
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
