/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (09/11) — a carga que o rodízio usa vs a carga real.
 *
 * O rodízio escolhe pela **carga em aberto** (exclui venda, produção, finalizado
 * e descartado). Se essa carga for muito diferente do total, o rodízio está
 * "certo" pelo critério dele — mas o resultado parece injusto para o time.
 *
 * Aqui se mostra, por vendedor:
 *   - total de leads;
 *   - quantos em aberto (o que o rodízio conta);
 *   - quantos encerrados;
 *   - quantos recebeu do rodízio.
 *
 * GET /backend/v1/diag/carga-real
 */
routerAdd(
  'GET',
  '/backend/v1/diag/carga-real',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, vendedores: [] }

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

    const ENCERRADOS = {
      venda_realizada: 1,
      producao: 1,
      finalizado: 1,
      descartado: 1,
      fechado: 1,
      perdido: 1,
    }

    const porDono = {}
    try {
      for (const l of app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '',
        12000,
        0,
      )) {
        const d = String(l.get('owner_id') || '')
        if (d === '') continue
        const n = nomes[d] || d
        if (n.indexOf('Marketing') >= 0) continue
        if (!porDono[n]) porDono[n] = { total: 0, abertos: 0, encerrados: 0 }
        porDono[n].total++
        const st = String(l.get('status') || 'entrada_lead')
        if (ENCERRADOS[st]) porDono[n].encerrados++
        else porDono[n].abertos++
      }
    } catch (e1) {}

    // quantos vieram do rodízio
    const doRodizio = {}
    try {
      for (const t of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_transferencias'),
        "regra='rodizio' && estado='concluida'",
        '',
        6000,
        0,
      )) {
        const v = String(t.get('vendedor_user') || '')
        if (v === '') continue
        const n = nomes[v] || v
        doRodizio[n] = (doRodizio[n] || 0) + 1
      }
    } catch (e2) {}

    const REAIS = ['Adriana Santos', 'Fábio Teles', 'Elisangela Silva', 'Douglas Renato']
    for (const n of REAIS) {
      const p = porDono[n] || { total: 0, abertos: 0, encerrados: 0 }
      out.vendedores.push({
        nome: n,
        total: p.total,
        abertos: p.abertos,
        encerrados: p.encerrados,
        do_rodizio: doRodizio[n] || 0,
      })
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
