/// <reference path="../pb_data/types.d.ts" />
/**
 * VERIFICAÇÃO PONTUAL (06/11) — quantas conversões o lead de prova gerou?
 *
 * O CA-3-59 exige UMA conversão por lead e venda, com o mesmo `event_id`.
 * Entrar, sair e voltar da etapa não pode criar outra.
 *
 * GET /backend/v1/diag/conversas-prova?lead=<id>
 */
routerAdd(
  'GET',
  '/backend/v1/diag/conversas-prova',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const lead = String(e.request.url.query().get('lead') || '')
    const col = $app.findCollectionByNameOrId('conversion_events')
    var convs = []
    try {
      convs = $app.findRecordsByFilter(col, lead !== '' ? "lead_id='" + lead + "'" : '', '', 50, 0)
    } catch (e0) {
      return e.json(200, { ok: false, erro: String(e0).slice(0, 120) })
    }
    const itens = []
    for (const c of convs) {
      itens.push({
        id: c.id,
        lead: String(c.get('lead_id') || ''),
        valor: Number(c.get('valor') || 0),
        estado: String(c.get('estado') || ''),
        event_id: String(c.get('event_id') || ''),
        event_name: String(c.get('event_name') || ''),
        tentativas: Number(c.get('tentativas') || 0),
        erro: String(c.get('ultimo_erro') || '').slice(0, 80),
      })
    }
    return e.json(200, { ok: true, quantas: itens.length, itens: itens })
  },
  $apis.requireAuth(),
)
