/// <reference path="../pb_data/types.d.ts" />
/**
 * VERIFICAÇÃO (09/11) — as 4 carteiras entraram direitinho?
 *
 * **SÓ LEITURA.** Confere, por vendedor:
 *   - quantos contatos tem na carteira;
 *   - quantos estão com `origem` de importação;
 *   - se há contato sem telefone válido;
 *   - quantos estão sem dono (vendedor_user vazio).
 *
 * Se as 4 carteiras têm volume e origem consistente, a importação (CA-3-78)
 * já foi feita e o card só precisa de prova.
 *
 * GET /backend/v1/diag/verifica-carteiras
 */
routerAdd(
  'GET',
  '/backend/v1/diag/verifica-carteiras',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, total: 0, sem_dono: 0, telefone_invalido: 0, por_vendedor: {} }

    const nomes = {}
    try {
      for (const u of app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        '',
        '',
        300,
        0,
      )) {
        nomes[u.id] = String(u.get('name') || u.get('email') || '')
      }
    } catch (e0) {}

    var cart = []
    try {
      cart = app.findRecordsByFilter(
        app.findCollectionByNameOrId('carteira_contatos'),
        '',
        '',
        120000,
        0,
      )
    } catch (e1) {
      return e.json(200, { ok: false, erro: String(e1).slice(0, 150) })
    }
    out.total = cart.length

    const origens = {}
    for (const c of cart) {
      const v = String(c.get('vendedor_user') || '')
      const nome = v !== '' ? nomes[v] || v.slice(0, 10) : 'SEM DONO'
      if (v === '') out.sem_dono++

      const tel = String(c.get('telefone') || '').replace(/[^0-9]/g, '')
      if (tel.length < 10 || tel.length > 13) out.telefone_invalido++

      if (!out.por_vendedor[nome]) {
        out.por_vendedor[nome] = { contatos: 0, sem_nome: 0, sem_origem: 0 }
      }
      out.por_vendedor[nome].contatos++
      if (String(c.get('nome') || '') === '') out.por_vendedor[nome].sem_nome++
      const org = String(c.get('origem') || '')
      if (org === '') out.por_vendedor[nome].sem_origem++
      if (org !== '') origens[org] = (origens[org] || 0) + 1
    }
    out.origens = origens

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
