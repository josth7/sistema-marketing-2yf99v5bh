/// <reference path="../pb_data/types.d.ts" />
/**
 * Hooks do servidor — lembrete de decisão (SPEC-2-003, card a434ca96, CA-2-09).
 *
 * cronAdd global 'lembrete_revisao' 09:30 UTC — DESABILITADO por padrão
 * (_cron_settings disabled=true na migração 0031; gate: destinatários reais
 * pendentes do workshop DH-07/CL-003 22/10 — SPEC-2-005). Provas usam a rota
 * tick com relógio de teste (padrão do job quinzenal e do avaliador).
 *
 * Job diário 09:30 UTC (SPEC): verifica review_date < hojeRef, state != closed
 * e destinatário AUTORIZADO (grant manage_decisions válido — conta revogada não
 * recebe); cria item na inbox com dedupe_key decision_id+revision+review_date+user
 * — UM lembrete por revisão/data/destinatário; replay/retry não duplica.
 * Reagendamento (PATCH review_date): lembretes pendentes antigos → tipo='cancelled'
 * (trilha preservada). Decisão encerrada: job ignora; lembrete pendente antigo
 * → cancelled (cessação de notificações antigas).
 * Ausência de usuário elegível = falha operacional registrada no resumo (aviso),
 * sem encaminhar a terceiro.
 *
 * Rotas:
 *   POST /backend/v1/lembretes/tick → relógio de teste {data: AAAA-MM-DD}
 *   (GET/PATCH da caixa continuam em caixa.js — itens tipo lembrete renderizam
 *    na caixa com decision_id; caixa.js estendido neste card)
 */

// ==================== CRON (lógica inline — cópia A) ====================
cronAdd('lembrete_revisao', '30 9 * * *', () => {
  const hojeRef = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const app = $app
  const resumo = { hojeRef: hojeRef, decisoes: 0, criados: 0, cancelados: 0, avisos: [] }
  processar(app, hojeRef, resumo)
  console.log('lembrete_revisao: ' + JSON.stringify(resumo))

  function processar(app, hojeRef, resumo) {
    const colD = app.findCollectionByNameOrId('decisions')
    const colI = app.findCollectionByNameOrId('inbox_items')
    const colG = app.findCollectionByNameOrId('access_grants')

    function temAction(userId, action) {
      const hoje = new Date().toISOString().slice(0, 10)
      const meus = app.findRecordsByFilter(
        colG,
        "user_id='" + userId + "' && revoked_at=''",
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
        if (acts.indexOf(action) >= 0) return true
      }
      return false
    }

    // ---- cessação: decisões encerradas ou reagendadas → lembretes pendentes antigos ----
    const pendentes = app.findRecordsByFilter(
      colI,
      "tipo='lembrete' && status='delivered'",
      '-created',
      500,
      0,
    )
    for (const p of pendentes) {
      try {
        const d = app.findRecordById(colD, String(p.get('decision_id') || ''))
        const stateD = String(d.get('state') || '')
        const dataLembrete = String(p.get('dedupe_key') || '').split('|')[2] || ''
        // reagendada (review_date atual ≠ a do lembrete) OU encerrada → cancelar
        if (stateD === 'closed' || String(d.get('review_date') || '') !== dataLembrete) {
          p.set('tipo', 'cancelled')
          app.save(p)
          resumo.cancelados++
        }
      } catch (eD) {
        // decisão apagada — cancelar lembrete órfão
        p.set('tipo', 'cancelled')
        app.save(p)
        resumo.cancelados++
      }
    }

    // ---- vencidas: review_date < hojeRef, state != closed ----
    const abertas = app.findRecordsByFilter(
      colD,
      "state!='closed' && review_date!=''",
      '-created',
      200,
      0,
    )
    resumo.decisoes = abertas.length
    for (const d of abertas) {
      try {
        const reviewDate = String(d.get('review_date') || '')
        if (reviewDate === '' || reviewDate >= hojeRef) continue
        const respId = String(d.get('responsible_user') || '')
        if (respId === '') {
          resumo.avisos.push('decisão ' + d.id + ' sem responsável — falha operacional registrada')
          continue
        }
        // destinatário AUTORIZADO (manage_decisions válido); revogado não recebe
        if (!temAction(respId, 'manage_decisions')) {
          resumo.avisos.push(
            'responsável da decisão ' + d.id + ' sem manage_decisions válido — não recebe',
          )
          continue
        }
        const dedupe = d.id + '|' + Number(d.get('revision') || 1) + '|' + reviewDate + '|' + respId
        const existentes = app.findRecordsByFilter(colI, "dedupe_key='" + dedupe + "'", '', 1, 0)
        if (existentes && existentes.length > 0) continue // replay não duplica
        const item = new Record(colI)
        item.set('tipo', 'lembrete')
        item.set('decision_id', d.id)
        item.set('report_id', '')
        item.set('user_id', respId)
        item.set('scope', String(d.get('scope') || ''))
        item.set('status', 'delivered')
        item.set('attempts', 1)
        item.set('delivered_at', new Date().toISOString())
        item.set('dedupe_key', dedupe)
        app.save(item)
        resumo.criados++
      } catch (eC) {
        resumo.avisos.push('decisão ' + String(d && d.id) + ': ' + String(eC).slice(0, 120))
      }
    }
  }
})

// ==================== ROTA TICK (relógio de teste — cópia B idêntica) ====================
routerAdd(
  'POST',
  '/backend/v1/lembretes/tick',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const body = e.requestInfo().body || {}
    const hojeRef = body.data
      ? String(body.data)
      : new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(hojeRef)) {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { data: 'formato AAAA-MM-DD' },
      })
    }
    const app = $app
    const resumo = { hojeRef: hojeRef, decisoes: 0, criados: 0, cancelados: 0, avisos: [] }
    const colD = app.findCollectionByNameOrId('decisions')
    const colI = app.findCollectionByNameOrId('inbox_items')
    const colG = app.findCollectionByNameOrId('access_grants')

    function temAction(userId, action) {
      const hoje = new Date().toISOString().slice(0, 10)
      const meus = app.findRecordsByFilter(
        colG,
        "user_id='" + userId + "' && revoked_at=''",
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
        if (acts.indexOf(action) >= 0) return true
      }
      return false
    }

    // cessação (encerradas/reagendadas)
    const pendentes = app.findRecordsByFilter(
      colI,
      "tipo='lembrete' && status='delivered'",
      '-created',
      500,
      0,
    )
    for (const p of pendentes) {
      try {
        const d = app.findRecordById(colD, String(p.get('decision_id') || ''))
        const stateD = String(d.get('state') || '')
        const dataLembrete = String(p.get('dedupe_key') || '').split('|')[2] || ''
        if (stateD === 'closed' || String(d.get('review_date') || '') !== dataLembrete) {
          p.set('tipo', 'cancelled')
          app.save(p)
          resumo.cancelados++
        }
      } catch (eD) {
        p.set('tipo', 'cancelled')
        app.save(p)
        resumo.cancelados++
      }
    }

    // vencidas
    const abertas = app.findRecordsByFilter(
      colD,
      "state!='closed' && review_date!=''",
      '-created',
      200,
      0,
    )
    resumo.decisoes = abertas.length
    for (const d of abertas) {
      try {
        const reviewDate = String(d.get('review_date') || '')
        if (reviewDate === '' || reviewDate >= hojeRef) continue
        const respId = String(d.get('responsible_user') || '')
        if (respId === '') {
          resumo.avisos.push('decisão ' + d.id + ' sem responsável — falha operacional registrada')
          continue
        }
        if (!temAction(respId, 'manage_decisions')) {
          resumo.avisos.push(
            'responsável da decisão ' + d.id + ' sem manage_decisions válido — não recebe',
          )
          continue
        }
        const dedupe = d.id + '|' + Number(d.get('revision') || 1) + '|' + reviewDate + '|' + respId
        const existentes = app.findRecordsByFilter(colI, "dedupe_key='" + dedupe + "'", '', 1, 0)
        if (existentes && existentes.length > 0) continue
        const item = new Record(colI)
        item.set('tipo', 'lembrete')
        item.set('decision_id', d.id)
        item.set('report_id', '')
        item.set('user_id', respId)
        item.set('scope', String(d.get('scope') || ''))
        item.set('status', 'delivered')
        item.set('attempts', 1)
        item.set('delivered_at', new Date().toISOString())
        item.set('dedupe_key', dedupe)
        app.save(item)
        resumo.criados++
      } catch (eC) {
        resumo.avisos.push('decisão ' + String(d && d.id) + ': ' + String(eC).slice(0, 120))
      }
    }
    return e.json(200, { ok: true, tick: resumo })
  },
  $apis.requireAuth(),
)
