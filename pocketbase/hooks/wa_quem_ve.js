/// <reference path="../pb_data/types.d.ts" />
/**
 * Diagnóstico de acessos (30/10) — só para o dono conferir quem vê o quê.
 *
 * GET /backend/v1/wa/quem-ve-o-que
 *   lista cada usuário com as ações efetivas e os módulos que o menu daria.
 *
 * Exige autenticação e um grant com `manage_access` OU ser o dono do
 * assistente (o primeiro usuário com manage_access já passa, então a rota
 * fica com a gerência). Sem isso, 403.
 */

routerAdd(
  'GET',
  '/backend/v1/wa/quem-ve-o-que',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

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
    var todos = []
    try {
      todos = $app.findRecordsByFilter(colG, "revoked_at=''", '', 300, 0)
    } catch (errT) {}

    // quem está pedindo tem manage_access?
    var souAdmin = false
    for (const g of todos) {
      if (String(g.get('user_id')) !== e.auth.id) continue
      const acts = lista(g.get('actions'))
      if (acts.indexOf('manage_access') >= 0) souAdmin = true
    }
    if (!souAdmin) return e.json(403, { ok: false, erro: 'só quem tem manage_access' })

    const colU = $app.findCollectionByNameOrId('users')
    var users = []
    try {
      users = $app.findRecordsByFilter(colU, '', 'email', 200, 0)
    } catch (errU) {}

    const catalogo = [
      { para: '/painel', exige: 'read_metrics' },
      { para: '/criterios', exige: 'manage_criteria' },
      { para: '/alertas', exige: 'read_alerts' },
      { para: '/decisoes', exige: 'read_decisions' },
      { para: '/relatorios', exige: 'read_reports' },
      { para: '/caixa', exige: 'read_reports' },
      { para: '/leads', exige: 'read_metrics' },
      { para: '/conversas', exige: 'read_conversas' },
      { para: '/numeros', exige: 'manage_whatsapp' },
      { para: '/concorrentes', exige: 'read_analyses' },
      { para: '/analises', exige: 'read_analyses' },
      { para: '/saude-canal', exige: 'read_metrics' },
    ]

    const itens = []
    for (const u of users) {
      const pode = []
      const papeis = []
      for (const g of todos) {
        if (String(g.get('user_id')) !== u.id) continue
        const papel = String(g.get('role') || '')
        if (papel !== '' && papeis.indexOf(papel) < 0) papeis.push(papel)
        const acts = lista(g.get('actions'))
        for (const a of acts) {
          const s = String(a)
          if (pode.indexOf(s) < 0) pode.push(s)
        }
      }
      const modulos = []
      for (const c of catalogo) {
        if (pode.indexOf(c.exige) >= 0) modulos.push(c.para)
      }
      itens.push({
        id: u.id,
        nome: String(u.get('name') || ''),
        email: String(u.get('email') || ''),
        papeis: papeis,
        acoes: pode,
        modulos: modulos,
      })
    }

    return e.json(200, { ok: true, itens: itens })
  },
  $apis.requireAuth(),
)
