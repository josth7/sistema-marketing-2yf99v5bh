/// <reference path="../pb_data/types.d.ts" />
/**
 * Hooks do servidor — caixa de entrada (SPEC-2-004, card a70d5ab8, CA-2-11).
 *
 * Rotas autenticadas ($apis.requireAuth()):
 *   GET   /backend/v1/inbox            → os itens do PRÓPRIO usuário (RLS reforçada)
 *   PATCH /backend/v1/inbox/{id}/read  → SÓ o destinatário marca como lida (403 p/ outro)
 *
 * Regras (SPEC):
 * - entrega interna autenticada — sem e-mail/WhatsApp nesta fase
 * - PATCH read idempotente: item já lido responde 200 sem mudar read_at
 * - PATCH read de outro usuário → 403 (prova de revogação/acesso)
 * - PATCH read de item inexistente → 404
 * - JSVM: lógica INLINE nos callbacks
 */
routerAdd(
  'GET',
  '/backend/v1/inbox',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const colI = $app.findCollectionByNameOrId('inbox_items')
    const itens = $app.findRecordsByFilter(colI, "user_id='" + e.auth.id + "'", '-created', 100, 0)
    const colR = $app.findCollectionByNameOrId('reports')
    const lista = []
    for (const it of itens) {
      let rel = null
      try {
        const r = $app.findRecordById(colR, String(it.get('report_id')))
        rel = {
          id: r.id,
          period_start: r.get('period_start'),
          period_end: r.get('period_end'),
          quinzena: r.get('quinzena'),
          state: r.get('state'),
          template_version: r.get('template_version'),
          report_revision: r.get('report_revision'),
          warnings: r.get('warnings') || null,
        }
      } catch (e2) {
        rel = null
      }
      lista.push({
        id: it.id,
        report_id: it.get('report_id'),
        relatorio: rel,
        scope: it.get('scope') || null,
        status: it.get('status'),
        attempts: it.get('attempts'),
        delivered_at: it.get('delivered_at'),
        read_at: it.get('read_at'),
        created: it.get('created'),
      })
    }
    return e.json(200, { ok: true, itens: lista })
  },
  $apis.requireAuth(),
)

routerAdd(
  'PATCH',
  '/backend/v1/inbox/{id}/read',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    let it
    try {
      it = $app.findRecordById('inbox_items', e.request.pathValue('id'))
    } catch (_) {
      return e.json(404, { ok: false, erro: 'item não encontrado' })
    }
    // SÓ o destinatário marca como lida (prova de revogação/acesso)
    if (String(it.get('user_id')) !== String(e.auth.id)) {
      return e.json(403, { ok: false, erro: 'só o destinatário pode marcar este item como lido' })
    }
    // idempotente: já lida responde 200 sem mudar read_at
    if (it.get('read_at')) {
      return e.json(200, { ok: true, id: it.id, read_at: it.get('read_at'), ja_lida: true })
    }
    it.set('read_at', new Date().toISOString())
    $app.save(it)
    return e.json(200, { ok: true, id: it.id, read_at: it.get('read_at'), ja_lida: false })
  },
  $apis.requireAuth(),
)
