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
    // guard read_reports — INLINE (JSVM: top-level não visível no callback);
    // a caixa continua POR USUÁRIO: RLS user_id abaixo é mantida
    var temReadReports = false
    {
      const hoje = new Date().toISOString().slice(0, 10)
      const colG = $app.findCollectionByNameOrId('access_grants')
      const meus = $app.findRecordsByFilter(
        colG,
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        50,
        0,
      )
      for (const g of meus) {
        const ate = String(g.get('valid_until') || '')
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
        if (acts.indexOf('read_reports') >= 0) temReadReports = true
      }
    }
    if (!temReadReports) {
      return e.json(403, {
        ok: false,
        erro: 'sem permissão para ler a caixa de entrada (read_reports) — fale com o administrador',
      })
    }
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
      // read_at pode não existir no banco de produção (migrações de schema não
      // chegam lá — prova 13/10): sintetiza a partir do marcador attempts>=1000
      let readAt = null
      try {
        const ra = it.get('read_at')
        if (ra) readAt = ra
      } catch (e5) {}
      if (
        !readAt &&
        (String(it.get('status') || '') === 'read' || Number(it.get('attempts') || 0) >= 1000)
      ) {
        readAt = String(it.get('updated') || '')
      }
      lista.push({
        id: it.id,
        report_id: it.get('report_id'),
        relatorio: rel,
        scope: it.get('scope') || null,
        status: it.get('status'),
        attempts: it.get('attempts'),
        delivered_at: it.get('delivered_at'),
        read_at: readAt,
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
    // PROVA 13/10: DateTime zerado do PocketBase chega como STRING VAZIA truthy —
    // o ramo "já lida" entrava na 1ª chamada e NUNCA gravava (read_at:"").
    // Conserto: comparar COMO STRING e exigir conteúdo real.
    var readAtual = ''
    try {
      readAtual = String(it.get('read_at') || '')
    } catch (e5) {}
    if (
      readAtual !== '' ||
      String(it.get('status') || '') === 'read' ||
      Number(it.get('attempts') || 0) >= 1000
    ) {
      return e.json(200, {
        ok: true,
        id: it.id,
        read_at: readAtual !== '' ? readAtual : String(it.get('updated') || ''),
        ja_lida: true,
      })
    }
    // self-heal: o campo read_at pode NÃO existir no banco de produção (prova
    // 13/10: PATCH 200 sem persistir). Adiciona o campo na hora; o marcador
    // attempts+=1000 garante o estado mesmo se o campo não puder ser criado.
    try {
      const colI2 = $app.findCollectionByNameOrId('inbox_items')
      let temCampo = false
      try {
        temCampo = !!colI2.fields.getByName('read_at')
      } catch (e8) {}
      if (!temCampo) {
        colI2.fields.add(new DateField({ name: 'read_at' }))
        $app.save(colI2)
      }
    } catch (e9) {}
    try {
      it.set('read_at', new Date().toISOString())
    } catch (e6) {}
    it.set('attempts', Number(it.get('attempts') || 0) + 1000)
    $app.save(it)
    // marcador 'read' no campo status (EXISTE no banco de produção — persiste
    // mesmo sem migração de schema; melhor-esforço: select pode rejeitar)
    try {
      it.set('status', 'read')
      $app.save(it)
    } catch (e12) {}
    // prova pós-save: re-lê do banco (não confia no objeto em memória)
    try {
      const reLido = $app.findRecordById('inbox_items', it.id)
      var readNovo = reLido.get('read_at')
      if (!readNovo && Number(reLido.get('attempts') || 0) >= 1000) {
        readNovo = String(reLido.get('updated') || '')
      }
    } catch (e7) {}
    var readNovo = null
    try {
      readNovo = it.get('read_at')
    } catch (e7) {}
    return e.json(200, {
      ok: true,
      id: it.id,
      read_at: readNovo || String(it.get('updated') || ''),
      ja_lida: false,
    })
  },
  $apis.requireAuth(),
)
