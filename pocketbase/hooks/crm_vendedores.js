/// <reference path="../pb_data/types.d.ts" />
/**
 * VENDEDORES PARA "TROCAR VENDEDOR" NO CRM (17/11, call com a Anézia).
 *
 * Lista quem pode receber lead: usuário com CONEXÃO de vendedor ATIVA e real
 * (não fixture). É a mesma regra do rodízio — conta de gestão, agência ou
 * marketing nunca aparece.
 *
 * Rota: GET /backend/v1/crm/vendedores → { ok, itens: [{ id, nome, final }] }
 */
routerAdd(
  'GET',
  '/backend/v1/crm/vendedores',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const itens = []
    try {
      const cxs = $app.findRecordsByFilter(
        'whatsapp_conexoes',
        "papel='vendedor' && ativo=true && fixture=false",
        '',
        50,
        0,
      )
      const vistos = {}
      for (const c of cxs) {
        const u = String(c.get('vendedor_user') || '')
        if (u === '' || vistos[u]) continue
        vistos[u] = true
        var nome = ''
        try {
          nome = String($app.findRecordById('users', u).get('name') || '')
        } catch (eU) {}
        if (nome === '')
          nome = String(c.get('nome_exibicao') || c.get('vendedor_nome_publico') || '')
        const d = String(c.get('numero') || '').replace(/\D/g, '')
        itens.push({ id: u, nome: nome, final: d.slice(-4) })
      }
    } catch (e1) {
      return e.json(200, { ok: false, erro: 'não consegui listar os vendedores', itens: [] })
    }
    itens.sort(function (a, b) {
      return a.nome.localeCompare(b.nome)
    })
    return e.json(200, { ok: true, itens: itens })
  },
  $apis.requireAuth(),
)
