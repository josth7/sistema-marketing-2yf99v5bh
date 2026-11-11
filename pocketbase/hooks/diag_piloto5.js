/// <reference path="../pb_data/types.d.ts" />
/**
 * AS MENSAGENS DE HOJE NO PILOTO (11/11).
 *
 * O filtro do PocketBase devolveu 400 registros antigos sem ordenação. Aqui se
 * filtra pela DATA de hoje direto no banco.
 *
 * GET /backend/v1/piloto/hoje
 */
routerAdd(
  'GET',
  '/backend/v1/piloto/hoje',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, recebidas_hoje: [], conversas_hoje: [], leads_hoje: [] }

    try {
      const msgs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "direcao='entrada' && created>='2026-11-11'",
        '',
        500,
        0,
      )
      for (const m of msgs) {
        out.recebidas_hoje.push({
          tel: String(m.get('contato_telefone') || ''),
          quando: String(m.get('created') || '').slice(11, 19),
          texto: String(m.get('texto') || '').slice(0, 50),
        })
      }
      out.recebidas_hoje.sort(function (a, b) {
        return a.quando < b.quando ? 1 : -1
      })
      out.recebidas_hoje = out.recebidas_hoje.slice(0, 12)
    } catch (e1) {
      out.erro1 = String(e1).slice(0, 120)
    }

    try {
      const cvs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "created>='2026-11-11'",
        '',
        200,
        0,
      )
      for (const c of cvs) {
        out.conversas_hoje.push({
          tel: String(c.get('contato_telefone') || '').slice(-8),
          estado: String(c.get('estado') || ''),
          numero: String(c.get('numero_nome') || ''),
          quando: String(c.get('created') || '').slice(11, 19),
        })
      }
    } catch (e2) {}

    try {
      const ls = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        "created>='2026-11-11'",
        '',
        200,
        0,
      )
      for (const l of ls) {
        out.leads_hoje.push({
          nome: String(l.get('nome') || '').slice(0, 20),
          tel: String(l.get('telefone') || '').slice(-8),
          status: String(l.get('status') || ''),
          quando: String(l.get('created') || '').slice(11, 19),
        })
      }
    } catch (e3) {}

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
