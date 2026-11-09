/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (09/11) — por que o rodízio deu 46 para uma e 6 para outra?
 *
 * **SÓ LEITURA.** O critério é "menor carga". Se todos têm ~475 leads, a
 * escolha deveria ser parecida. Aqui se mostra, **na ordem em que os pedidos
 * aconteceram**, qual era a carga de cada um no momento da escolha.
 *
 * Isso revela se o desequilíbrio nasceu de:
 *   - carga desatualizada (o cron lê um número velho);
 *   - ordem fixa (sempre o mesmo primeiro quando empatam);
 *   - filtro que exclui alguém (fixture, gestão, e-mail).
 *
 * GET /backend/v1/diag/rodizio-ordem
 */
routerAdd(
  'GET',
  '/backend/v1/diag/rodizio-ordem',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, total: 0, sequencia: [], por_vendedor: {}, empates: 0 }

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

    // carga ATUAL por dono
    const cargaAtual = {}
    var leads = []
    try {
      leads = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '',
        12000,
        0,
      )
      for (const l of leads) {
        const d = String(l.get('owner_id') || '')
        if (d !== '') cargaAtual[d] = (cargaAtual[d] || 0) + 1
      }
    } catch (e1) {}

    // pedidos de rodízio em ordem cronológica
    var trs = []
    try {
      trs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_transferencias'),
        "regra='rodizio'",
        '',
        6000,
        0,
      )
    } catch (e2) {}
    trs.sort(function (a, b) {
      return String(a.get('created') || '').localeCompare(String(b.get('created') || ''))
    })
    out.total = trs.length

    // conta quantas idas cada um recebeu, na ordem
    const contagem = {}
    for (const t of trs) {
      const v = String(t.get('vendedor_user') || '')
      if (v === '') continue
      const n = nomes[v] || v
      contagem[n] = (contagem[n] || 0) + 1
      if (out.sequencia.length < 40) {
        out.sequencia.push({
          quando: String(t.get('created') || '').slice(0, 16),
          quem: n,
          estado: String(t.get('estado') || ''),
          acumulado: contagem[n],
        })
      }
    }
    out.por_vendedor = contagem

    // carga atual de cada vendedor real
    out.carga_atual = {}
    for (const id in cargaAtual) {
      const n = nomes[id] || id
      if (n.indexOf('Marketing') >= 0) continue
      out.carga_atual[n] = cargaAtual[id]
    }

    // quantos empataram em carga (mesmo número)
    const valores = []
    for (const n in out.carga_atual) valores.push(out.carga_atual[n])
    var iguais = 0
    for (var i = 0; i < valores.length; i++) {
      for (var j = i + 1; j < valores.length; j++) {
        if (valores[i] === valores[j]) iguais++
      }
    }
    out.empates = iguais

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
