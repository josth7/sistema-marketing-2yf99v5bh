/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0132 — "precisa de ação" (CA-3-69, RN-134, 05/11).
 *
 * **O problema:** quando alguém sai da empresa, o suspender de hoje devolve a
 * carteira ao rodízio automaticamente. A SPEC de 05/11 mudou isso: cliente do
 * vendedor X fica com X — e se X saiu, **a gestão decide**, não o rodízio.
 * O cliente não pode trocar de mãos sem alguém olhar.
 *
 * **O que esta migração cria:**
 *   - `precisa_acao`: fila de itens que esperam decisão da gestão.
 *     Um item por lead órfão, com o motivo e o dono anterior.
 *   - `status` select em `crm_leads` já existe; aqui não mexo.
 *
 * O item é criado pelo suspender e resolvido quando a gestão passa a carteira
 * em bloco para outra pessoa (um evento por lead, como a SPEC pede).
 */
migrate(
  (app) => {
    var existe = null
    try {
      existe = app.findCollectionByNameOrId('precisa_acao')
    } catch (e0) {}

    if (!existe) {
      const col = new Collection({
        name: 'precisa_acao',
        type: 'base',
        fields: [
          { name: 'lead', type: 'text' },
          { name: 'dono_anterior', type: 'text' },
          { name: 'dono_anterior_nome', type: 'text' },
          { name: 'motivo', type: 'text' },
          { name: 'resolvido', type: 'bool' },
          { name: 'resolvido_em', type: 'date' },
          { name: 'resolvido_por', type: 'text' },
          { name: 'resolvido_para', type: 'text' },
          { name: 'fixture', type: 'bool' },
          { name: 'dedupe_key', type: 'text' },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_precisa_acao_dedupe ON precisa_acao (dedupe_key)'],
      })
      app.save(col)
      console.log('0132: colecao precisa_acao criada')
    } else {
      console.log('0132: colecao ja existia')
    }

    // ---------- o que JÁ está órfão hoje entra na fila ----------
    // Leads cujo dono é alguém suspenso (tem grant revogado e nenhum ativo).
    const colL = app.findCollectionByNameOrId('crm_leads')
    const colG = app.findCollectionByNameOrId('access_grants')
    const colU = app.findCollectionByNameOrId('users')

    const ativos = {}
    const revogados = {}
    try {
      const gs = app.findRecordsByFilter(colG, '', '', 4000, 0)
      for (const g of gs) {
        const uid = String(g.get('user_id') || '')
        if (uid === '') continue
        if (String(g.get('revoked_at') || '') === '') ativos[uid] = true
        else revogados[uid] = true
      }
    } catch (e1) {}

    const suspensos = {}
    for (const uid in revogados) if (!ativos[uid]) suspensos[uid] = true

    const nomes = {}
    try {
      for (const u of app.findRecordsByFilter(colU, '', '', 400, 0)) {
        nomes[u.id] = String(u.get('name') || u.get('email') || '')
      }
    } catch (e2) {}

    var criados = 0
    if (Object.keys(suspensos).length > 0) {
      var leads = []
      try {
        leads = app.findRecordsByFilter(colL, 'fixture=false', '', 8000, 0)
      } catch (e3) {}
      const colPA = app.findCollectionByNameOrId('precisa_acao')
      for (const l of leads) {
        const dono = String(l.get('owner_id') || '')
        if (dono === '' || !suspensos[dono]) continue
        const chave = 'suspenso|' + l.id
        try {
          const ja = app.findRecordsByFilter(colPA, "dedupe_key='" + chave + "'", '', 1, 0)
          if (ja && ja.length > 0) continue
        } catch (e4) {}
        try {
          const item = new Record(colPA)
          item.set('lead', l.id)
          item.set('dono_anterior', dono)
          item.set('dono_anterior_nome', nomes[dono] || dono)
          item.set('motivo', 'vendedor_suspenso')
          item.set('resolvido', false)
          item.set('fixture', false)
          item.set('dedupe_key', chave)
          app.save(item)
          criados++
        } catch (e5) {}
      }
    }
    console.log('0132: itens de carteira orfa criados = ' + criados)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('precisa_acao'))
    } catch (e) {}
  },
)
