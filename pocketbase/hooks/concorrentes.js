/// <reference path="../pb_data/types.d.ts" />
/**
 * Concorrentes (fase 4, card 4) — observações manuais.
 *
 * Rotas (autenticadas):
 *   GET  /backend/v1/concorrentes/obs  → lista (read_leads — mesma equipe do CRM)
 *   POST /backend/v1/concorrentes/obs  → cria (manage_leads)
 * JSVM: lógica INLINE; fixture separado; sort vazio (lição 22/10).
 */

routerAdd(
  'GET',
  '/backend/v1/concorrentes/obs',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '-created',
      50,
      0,
    )
    var temRead = false
    for (const g of meus) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
      if (ate !== '' && ate.slice(0, 10) < hoje) continue
      let acts = []
      try {
        const raw = g.get('actions')
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          acts = JSON.parse(String.fromCharCode.apply(null, raw))
        } else if (typeof raw === 'string') {
          acts = JSON.parse(raw)
        } else {
          acts = raw || []
        }
      } catch (e2) {}
      if (acts.indexOf('read_leads') >= 0) temRead = true
    }
    if (!temRead) {
      return e.json(403, { ok: false, erro: 'sem permissão para ver observações (read_leads)' })
    }
    const ehFixture = String(e.auth.email || '').indexOf('.fixture.') >= 0
    const colO = $app.findCollectionByNameOrId('concorrentes_obs')
    const registros = $app.findRecordsByFilter(
      colO,
      'fixture=' + (ehFixture ? 'true' : 'false'),
      '',
      300,
      0,
    )
    // ordenar no cliente (sort no findRecordsByFilter lança 400 — lição 22/10)
    const lista = []
    for (const o of registros) {
      lista.push({
        id: o.id,
        concorrente: o.get('concorrente'),
        data_obs: String(o.get('data_obs') || ''),
        tipo: o.get('tipo') || 'outro',
        texto: o.get('texto'),
        canal_visto: o.get('canal_visto'),
        user_id: o.get('user_id'),
        criado_em: String(o.get('created') || ''),
      })
    }
    lista.sort(function (a, b) {
      return a.criado_em < b.criado_em ? 1 : -1
    })
    return e.json(200, { ok: true, total: lista.length, itens: lista })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/concorrentes/obs',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '-created',
      50,
      0,
    )
    var temManage = false
    for (const g of meus) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
      if (ate !== '' && ate.slice(0, 10) < hoje) continue
      let acts = []
      try {
        const raw = g.get('actions')
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          acts = JSON.parse(String.fromCharCode.apply(null, raw))
        } else if (typeof raw === 'string') {
          acts = JSON.parse(raw)
        } else {
          acts = raw || []
        }
      } catch (e2) {}
      if (acts.indexOf('manage_leads') >= 0) temManage = true
    }
    if (!temManage) {
      return e.json(403, {
        ok: false,
        erro: 'sem permissão para registrar observações (manage_leads)',
      })
    }
    const body = e.requestInfo().body || {}
    const concorrente = String(body.concorrente || '').trim()
    if (concorrente === '') {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { concorrente: 'informe o concorrente' },
      })
    }
    const TIPOS = ['preco', 'lancamento', 'promocao', 'produto', 'outro']
    const tipo =
      TIPOS.indexOf(String(body.tipo || 'outro')) >= 0 ? String(body.tipo || 'outro') : 'outro'
    const ehFixture = String(e.auth.email || '').indexOf('.fixture.') >= 0
    const colO = $app.findCollectionByNameOrId('concorrentes_obs')
    const rec = new Record(colO)
    rec.set('concorrente', concorrente.slice(0, 120))
    if (body.data_obs) {
      try {
        rec.set('data_obs', String(body.data_obs))
      } catch (eD) {}
    }
    rec.set('tipo', tipo)
    rec.set(
      'texto',
      String(body.texto || '')
        .trim()
        .slice(0, 2000),
    )
    rec.set(
      'canal_visto',
      String(body.canal_visto || '')
        .trim()
        .slice(0, 80),
    )
    rec.set('user_id', e.auth.id)
    rec.set('fixture', ehFixture)
    try {
      $app.save(rec)
    } catch (eSaveSolto) {
      console.log('save falhou em concorrentes.js: ' + String(eSaveSolto).slice(0, 160))
    }
    return e.json(201, { ok: true, id: rec.id })
  },
  $apis.requireAuth(),
)
