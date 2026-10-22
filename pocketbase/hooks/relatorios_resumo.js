/// <reference path="../pb_data/types.d.ts" />
/**
 * Hooks do servidor — revisão do resumo de IA (SPEC-3-003, card 2, CA-3-07).
 *
 * Rotas (autenticadas — $apis.requireAuth()):
 *   GET  /backend/v1/reports/{id}/resumo        → estado do resumo do relatório (revisores e leitores)
 *   POST /backend/v1/reports/{id}/resumo/revisar → {acao: aprovar|editar|rejeitar, texto?, nota?}
 *   POST /backend/v1/reports/{id}/resumo/retirar → {nota} — revisão N+2 sem o resumo
 *
 * Regras (SPEC-3-003):
 * - RN-23: aprovar/editar → texto_publicado = rascunho ou editado (1–2.500); revisão N+1
 *   do relatório clona o snapshot da fonte + resumo_publicado + registro de revisão;
 *   entrega aos destinatários ATUAIS da política (mesma lógica do republish); itens de
 *   caixa dos demais revisores fechados; idempotência por summary_id+acao.
 * - RN-24: rejeitar exige nota; estado rejeitado (terminal); nada circula.
 * - RN-26: rótulo fixo "Gerado por IA — validar antes de decidir" na leitura.
 * - RN-27: rascunho imutável; edição vive em texto_publicado; rascunho nunca em reports.
 * - RN-28: retirar (só após aprovado/editado) → revisão N+2 sem resumo com a nota.
 * - Guard: review_ai_summary (INLINE — JSVM não vê função top-level).
 * - Precondição atômica: estado=aguardando_revisao conferido no mesmo fluxo do update;
 *   segunda chamada → 409 ja_revisado.
 *
 * JSVM: TODA a lógica INLINE nos callbacks (pool de VM separado).
 */
routerAdd(
  'GET',
  '/backend/v1/reports/{id}/resumo',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    // guard: read_reports OU review_ai_summary — INLINE
    var temAcesso = false
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
        if (acts.indexOf('read_reports') >= 0 || acts.indexOf('review_ai_summary') >= 0)
          temAcesso = true
      }
    }
    if (!temAcesso) {
      return e.json(403, {
        ok: false,
        erro: 'sem permissão para ver o resumo (read_reports ou review_ai_summary)',
      })
    }
    let rep
    try {
      rep = $app.findRecordById('reports', e.request.pathValue('id'))
    } catch (_) {
      return e.json(404, { ok: false, erro: 'relatório não encontrado' })
    }
    const colS = $app.findCollectionByNameOrId('report_ai_summaries')
    let sums = $app.findRecordsByFilter(colS, "report_id='" + rep.id + "'", '-created', 10, 0)
    // se este relatório (revisão N) não tem resumo próprio, seguir a cadeia de
    // revisões (supersedes_id) — o resumo pertence à quinzena, não a uma revisão
    if (!sums || sums.length === 0) {
      try {
        const colR2 = $app.findCollectionByNameOrId('reports')
        let atual = rep
        for (let i = 0; i < 20; i++) {
          const ant = String(atual.get('supersedes_id') || '')
          if (!ant) break
          let anterior = null
          try {
            anterior = $app.findRecordById(colR2, ant)
          } catch (eA) {
            break
          }
          const sAnt = $app.findRecordsByFilter(
            colS,
            "report_id='" + anterior.id + "'",
            '-created',
            1,
            0,
          )
          if (sAnt && sAnt.length > 0) {
            sums = sAnt
            break
          }
          atual = anterior
        }
      } catch (eCadeia) {}
    }
    if (!sums || sums.length === 0) {
      return e.json(200, { ok: true, resumo: null, aviso: 'resumo indisponível' })
    }
    const s = sums[0]
    const estado = String(s.get('estado') || '')
    // revisores elegíveis (para a tela saber quem pode agir)
    var podeRevisar = false
    {
      const hoje2 = new Date().toISOString().slice(0, 10)
      const colG2 = $app.findCollectionByNameOrId('access_grants')
      const meus2 = $app.findRecordsByFilter(
        colG2,
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        50,
        0,
      )
      for (const g2 of meus2) {
        const ate2 = String(g2.get('valid_until') || '')
        if (ate2 !== '' && ate2.slice(0, 10) < hoje2) continue
        let acts2 = []
        try {
          const raw2 = g2.get('actions')
          if (Array.isArray(raw2) && raw2.length > 0 && typeof raw2[0] === 'number') {
            acts2 = JSON.parse(String.fromCharCode.apply(null, raw2))
          } else if (typeof raw2 === 'string') {
            acts2 = JSON.parse(raw2)
          } else {
            acts2 = raw2 || []
          }
        } catch (e3) {}
        if (acts2.indexOf('review_ai_summary') >= 0) podeRevisar = true
      }
    }
    return e.json(200, {
      ok: true,
      resumo: {
        id: s.id,
        estado: estado,
        rascunho: String(s.get('rascunho') || ''),
        texto_publicado: s.get('texto_publicado') || null,
        revisado_por: s.get('revisado_por') || null,
        revisado_em: s.get('revisado_em') || null,
        revisao_nota: s.get('revisao_nota') || null,
        prazo_revisao_em: s.get('prazo_revisao_em') || null,
        rotulo: 'Gerado por IA — validar antes de decidir',
      },
      pode_revisar: podeRevisar,
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/reports/{id}/resumo/revisar',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    // guard review_ai_summary — INLINE
    var temGrant = false
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
        if (acts.indexOf('review_ai_summary') >= 0) temGrant = true
      }
    }
    if (!temGrant) {
      return e.json(403, {
        ok: false,
        erro: 'sem permissão para revisar resumos (review_ai_summary) — fale com o administrador',
      })
    }
    const body = e.requestInfo().body || {}
    const acao = String(body.acao || '').trim()
    const texto = String(body.texto === undefined || body.texto === null ? '' : body.texto).trim()
    const nota = String(body.nota || '').trim()
    if (acao !== 'aprovar' && acao !== 'editar' && acao !== 'rejeitar') {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { acao: 'use aprovar, editar ou rejeitar' },
      })
    }
    if (acao === 'rejeitar' && nota === '') {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { nota: 'informe o motivo da rejeição' },
      })
    }
    if (acao === 'editar' && texto === '') {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { texto: 'informe o texto editado (1–2.500 caracteres)' },
      })
    }
    if (acao === 'editar' && texto.length > 2500) {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { texto: 'texto acima do limite de 2.500 caracteres' },
      })
    }
    let rep
    try {
      rep = $app.findRecordById('reports', e.request.pathValue('id'))
    } catch (_) {
      return e.json(404, { ok: false, erro: 'relatório não encontrado' })
    }
    const colS = $app.findCollectionByNameOrId('report_ai_summaries')
    const sums = $app.findRecordsByFilter(colS, "report_id='" + rep.id + "'", '-created', 10, 0)
    if (!sums || sums.length === 0) {
      return e.json(404, { ok: false, erro: 'sem resumo para este relatório' })
    }
    const sum = sums[0]
    const estado = String(sum.get('estado') || '')
    const agora = new Date().toISOString()
    // replay primeiro: MESMA chave devolve a MESMA revisão (mesmo já revisado)
    function uuidV4() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
      })
    }
    if (acao !== 'rejeitar') {
      const chaveReplay = 'resumo-' + sum.id + '-' + acao
      const colR0 = $app.findCollectionByNameOrId('reports')
      const replay0 = $app.findRecordsByFilter(
        colR0,
        "idempotency_key='" + chaveReplay + "'",
        '-created',
        1,
        0,
      )
      if (replay0 && replay0.length > 0) {
        const r0 = replay0[0]
        // replay legítimo = o MESMO revisor reenviando a MESMA ação;
        // outro revisor chegando depois da revisão → 409 ja_revisado
        if (String(r0.get('generated_by') || '') === String(e.auth.id)) {
          return e.json(200, {
            ok: true,
            id: r0.id,
            report_revision: r0.get('report_revision'),
            replay: true,
            aviso: 'replay — mesma revisão devolvida',
          })
        }
        return e.json(409, {
          ok: false,
          erro: 'ja_revisado',
          detalhe: 'resumo já está em ' + estado,
        })
      }
    }
    // precondição atômica: só aguardando_revisao pode ser revisado
    if (estado !== 'aguardando_revisao') {
      return e.json(409, {
        ok: false,
        erro: 'ja_revisado',
        detalhe: 'resumo já está em ' + estado,
      })
    }
    // prazo vencido? revisão tardia ainda pode aprovar (RN-25) — segue
    const rascunho = String(sum.get('rascunho') || '')
    let textoPublicado = ''
    let novoEstado = ''
    if (acao === 'aprovar') textoPublicado = rascunho
    else if (acao === 'editar') textoPublicado = texto
    else novoEstado = 'rejeitado'
    if (acao !== 'rejeitar') novoEstado = acao === 'aprovar' ? 'aprovado' : 'editado'

    if (acao === 'rejeitar') {
      sum.set('estado', 'rejeitado')
      sum.set('revisado_por', e.auth.id)
      sum.set('revisado_em', agora)
      sum.set('revisao_nota', nota.slice(0, 500))
      $app.save(sum)
      // itens dos demais revisores fechados
      const colI = $app.findCollectionByNameOrId('inbox_items')
      const itens = $app.findRecordsByFilter(
        colI,
        "dedupe_key~'" + sum.id + "' && status='pending'",
        '',
        50,
        0,
      )
      for (const it of itens) {
        it.set('status', 'delivered')
        it.set('read_at', agora)
        $app.save(it)
      }
      return e.json(200, {
        ok: true,
        estado: 'rejeitado',
        aviso: 'resumo rejeitado — nada circula (terminal nesta fase)',
      })
    }

    // aprovar/editar → republicação (revisão N+1) clonando o snapshot da fonte
    const chave = 'resumo-' + sum.id + '-' + acao
    const colR = $app.findCollectionByNameOrId('reports')
    // replay: MESMA chave devolve a MESMA revisão
    const replay = $app.findRecordsByFilter(
      colR,
      "idempotency_key='" + chave + "'",
      '-created',
      1,
      0,
    )
    if (replay && replay.length > 0) {
      const r2 = replay[0]
      return e.json(200, {
        ok: true,
        id: r2.id,
        report_revision: r2.get('report_revision'),
        replay: true,
        aviso: 'replay — mesma revisão devolvida',
      })
    }
    const scopeFonte = String(rep.get('scope') || '').replace(/'/g, '')
    const filtro =
      "period_start='" +
      rep.get('period_start') +
      "' && period_end='" +
      rep.get('period_end') +
      "' && scope='" +
      scopeFonte +
      "'"
    const todos = $app.findRecordsByFilter(colR, filtro, '-report_revision', 50, 0)
    let maxRev = 0
    for (const t of todos) {
      const rev = Number(t.get('report_revision') || 0)
      if (rev > maxRev) maxRev = rev
    }
    const novaRev = maxRev + 1
    // destinatários ATUAIS da política correspondente
    const colP = $app.findCollectionByNameOrId('report_policy')
    const pols = $app.findRecordsByFilter(
      colP,
      'fixture=' + (scopeFonte === 'fixture' ? 'true' : 'false'),
      '',
      1,
      0,
    )
    const destOk = []
    const avisos = []
    if (pols && pols.length > 0 && pols[0].get('fixture') === true) {
      try {
        const uFix = $app.findRecordsByFilter(
          $app.findCollectionByNameOrId('users'),
          "email='criterios.fixture.aprovador@haisan.com.br'",
          '',
          1,
          0,
        )
        if (uFix && uFix.length > 0) destOk.push(uFix[0].id)
        else avisos.push('aprovador fixture não encontrado — ninguém recebe')
      } catch (e9) {
        avisos.push('falha ao resolver aprovador fixture: ' + String(e9).slice(0, 80))
      }
      avisos.push('política FIXTURE: destinatário por e-mail → ' + destOk.length + ' válido(s)')
    } else if (pols && pols.length > 0) {
      let recipients = []
      try {
        const raw = pols[0].get('recipient_user_ids')
        recipients = typeof raw === 'string' ? JSON.parse(raw) : raw
      } catch (e2) {}
      for (const uid of recipients || []) {
        let resolvido = null
        try {
          resolvido = $app.findRecordById('users', uid)
        } catch (e3) {
          if (String(uid).indexOf('@') >= 0) {
            try {
              resolvido =
                $app.findRecordsByFilter(
                  $app.findCollectionByNameOrId('users'),
                  "email='" + String(uid).replace(/'/g, '') + "'",
                  '',
                  1,
                  0,
                )[0] || null
            } catch (e4) {}
          }
        }
        if (resolvido) destOk.push(resolvido.id)
        else avisos.push('destinatário ' + uid + ' não existe mais — não recebe')
      }
      avisos.push(
        'política real: ' +
          (recipients || []).length +
          ' gravado(s) → ' +
          destOk.length +
          ' válido(s)',
      )
    }
    if (destOk.indexOf(e.auth.id) < 0) {
      destOk.push(e.auth.id)
      avisos.push('revisor recebe cópia na caixa')
    }
    // registro de revisão (RN-26/RN-27)
    const nomeRevisor = String(e.auth.get('name') || e.auth.get('email') || '')
    const dataBR = agora.slice(0, 10)
    const registro =
      'Resumo gerado por IA, revisado por ' + nomeRevisor + ' em ' + dataBR + ' (' + acao + ')'
    // campos publicados podem não existir em produção — self-heal (padrão 13/10)
    try {
      let temCampo1 = false
      let temCampo2 = false
      try {
        temCampo1 = !!colR.fields.getByName('resumo_publicado')
        temCampo2 = !!colR.fields.getByName('resumo_revisao_registro')
      } catch (e20) {}
      if (!temCampo1 || !temCampo2) {
        if (!temCampo1) colR.fields.add(new TextField({ name: 'resumo_publicado', maxSize: 3000 }))
        if (!temCampo2)
          colR.fields.add(new TextField({ name: 'resumo_revisao_registro', max: 300 }))
        $app.save(colR)
      }
    } catch (e21) {}
    const colI = $app.findCollectionByNameOrId('inbox_items')
    let reportId = null
    $app.runInTransaction(function (txApp) {
      const rec = new Record(colR)
      rec.set('uuid', uuidV4())
      rec.set('period_start', rep.get('period_start'))
      rec.set('period_end', rep.get('period_end'))
      rec.set('quinzena', rep.get('quinzena'))
      rec.set('scope', rep.get('scope'))
      rec.set('template_version', rep.get('template_version'))
      rec.set('policy_version', rep.get('policy_version'))
      rec.set('report_revision', novaRev)
      rec.set('supersedes_id', rep.id)
      rec.set('revision_reason', 'resumo de IA revisado por ' + nomeRevisor)
      rec.set('idempotency_key', chave)
      rec.set('generated_by', e.auth.id)
      rec.set('generated_at', agora)
      rec.set('state', 'delivered')
      rec.set('origem', 'api')
      // snapshot CLONADO da fonte (adendo por revisão — o dado factual não muda)
      rec.set('data_snapshot_json', rep.get('data_snapshot_json'))
      rec.set('coverage_by_source', rep.get('coverage_by_source'))
      rec.set('comparison_eligibility', rep.get('comparison_eligibility'))
      rec.set('warnings', rep.get('warnings'))
      rec.set('alert_refs', rep.get('alert_refs'))
      rec.set('decision_refs', rep.get('decision_refs'))
      rec.set('resumo_publicado', textoPublicado)
      rec.set('resumo_revisao_registro', registro)
      txApp.save(rec)
      reportId = rec.id
      for (const uid of destOk) {
        const item = new Record(colI)
        item.set('report_id', reportId)
        item.set('user_id', uid)
        item.set('scope', rep.get('scope'))
        item.set('status', 'delivered')
        item.set('attempts', 1)
        item.set('delivered_at', agora)
        txApp.save(item)
      }
    })
    // registra a revisão no resumo (depois da transação)
    sum.set('estado', novoEstado)
    sum.set('texto_publicado', textoPublicado)
    sum.set('revisado_por', e.auth.id)
    sum.set('revisado_em', agora)
    sum.set('revisao_nota', nota.slice(0, 500))
    $app.save(sum)
    // itens de revisão dos demais revisores fechados
    const itens2 = $app.findRecordsByFilter(
      colI,
      "dedupe_key~'" + sum.id + "' && status='pending'",
      '',
      50,
      0,
    )
    for (const it of itens2) {
      it.set('status', 'delivered')
      it.set('read_at', agora)
      $app.save(it)
    }
    return e.json(200, {
      ok: true,
      estado: novoEstado,
      id: reportId,
      report_revision: novaRev,
      resumo_revisao_registro: registro,
      replay: false,
      avisos: avisos,
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/reports/{id}/resumo/retirar',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    // guard review_ai_summary — INLINE
    var temGrant = false
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
        if (acts.indexOf('review_ai_summary') >= 0) temGrant = true
      }
    }
    if (!temGrant) {
      return e.json(403, {
        ok: false,
        erro: 'sem permissão para retirar resumos (review_ai_summary) — fale com o administrador',
      })
    }
    const body = e.requestInfo().body || {}
    const nota = String(body.nota || '').trim()
    if (nota === '') {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { nota: 'informe o motivo da retirada' },
      })
    }
    let rep
    try {
      rep = $app.findRecordById('reports', e.request.pathValue('id'))
    } catch (_) {
      return e.json(404, { ok: false, erro: 'relatório não encontrado' })
    }
    const colS = $app.findCollectionByNameOrId('report_ai_summaries')
    const sums = $app.findRecordsByFilter(colS, "report_id='" + rep.id + "'", '-created', 10, 0)
    if (!sums || sums.length === 0) {
      return e.json(404, { ok: false, erro: 'sem resumo para este relatório' })
    }
    const sum = sums[0]
    const estado = String(sum.get('estado') || '')
    if (estado !== 'aprovado' && estado !== 'editado') {
      return e.json(409, {
        ok: false,
        erro: 'sem_resumo_publicado',
        detalhe: 'resumo está em ' + estado + ' — só resumo publicado pode ser retirado',
      })
    }
    const agora = new Date().toISOString()
    function uuidV4() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0
        const v = c === 'x' ? r : (r & 0x3) | 0x8
        return v.toString(16)
      })
    }
    const nomeRevisor = String(e.auth.get('name') || e.auth.get('email') || '')
    const chave = 'resumo-' + sum.id + '-retirar'
    const colR = $app.findCollectionByNameOrId('reports')
    const replay = $app.findRecordsByFilter(
      colR,
      "idempotency_key='" + chave + "'",
      '-created',
      1,
      0,
    )
    if (replay && replay.length > 0) {
      const r2 = replay[0]
      return e.json(200, {
        ok: true,
        id: r2.id,
        report_revision: r2.get('report_revision'),
        replay: true,
      })
    }
    const scopeFonte = String(rep.get('scope') || '').replace(/'/g, '')
    const filtro =
      "period_start='" +
      rep.get('period_start') +
      "' && period_end='" +
      rep.get('period_end') +
      "' && scope='" +
      scopeFonte +
      "'"
    const todos = $app.findRecordsByFilter(colR, filtro, '-report_revision', 50, 0)
    let maxRev = 0
    for (const t of todos) {
      const rev = Number(t.get('report_revision') || 0)
      if (rev > maxRev) maxRev = rev
    }
    const novaRev = maxRev + 1
    const colP = $app.findCollectionByNameOrId('report_policy')
    const pols = $app.findRecordsByFilter(
      colP,
      'fixture=' + (scopeFonte === 'fixture' ? 'true' : 'false'),
      '',
      1,
      0,
    )
    const destOk = []
    const avisos = []
    if (pols && pols.length > 0 && pols[0].get('fixture') === true) {
      try {
        const uFix = $app.findRecordsByFilter(
          $app.findCollectionByNameOrId('users'),
          "email='criterios.fixture.aprovador@haisan.com.br'",
          '',
          1,
          0,
        )
        if (uFix && uFix.length > 0) destOk.push(uFix[0].id)
      } catch (e9) {}
      avisos.push('política FIXTURE: destinatário por e-mail → ' + destOk.length + ' válido(s)')
    } else if (pols && pols.length > 0) {
      let recipients = []
      try {
        const raw = pols[0].get('recipient_user_ids')
        recipients = typeof raw === 'string' ? JSON.parse(raw) : raw
      } catch (e2) {}
      for (const uid of recipients || []) {
        let resolvido = null
        try {
          resolvido = $app.findRecordById('users', uid)
        } catch (e3) {
          if (String(uid).indexOf('@') >= 0) {
            try {
              resolvido =
                $app.findRecordsByFilter(
                  $app.findCollectionByNameOrId('users'),
                  "email='" + String(uid).replace(/'/g, '') + "'",
                  '',
                  1,
                  0,
                )[0] || null
            } catch (e4) {}
          }
        }
        if (resolvido) destOk.push(resolvido.id)
      }
      avisos.push(
        'política real: ' +
          (recipients || []).length +
          ' gravado(s) → ' +
          destOk.length +
          ' válido(s)',
      )
    }
    if (destOk.indexOf(e.auth.id) < 0) destOk.push(e.auth.id)
    const registro =
      'resumo retirado por ' +
      nomeRevisor +
      ' em ' +
      agora.slice(0, 10) +
      ' — ' +
      nota.slice(0, 200)
    const colI = $app.findCollectionByNameOrId('inbox_items')
    let reportId = null
    $app.runInTransaction(function (txApp) {
      const rec = new Record(colR)
      rec.set('uuid', uuidV4())
      rec.set('period_start', rep.get('period_start'))
      rec.set('period_end', rep.get('period_end'))
      rec.set('quinzena', rep.get('quinzena'))
      rec.set('scope', rep.get('scope'))
      rec.set('template_version', rep.get('template_version'))
      rec.set('policy_version', rep.get('policy_version'))
      rec.set('report_revision', novaRev)
      rec.set('supersedes_id', rep.id)
      rec.set('revision_reason', 'resumo de IA retirado por ' + nomeRevisor)
      rec.set('idempotency_key', chave)
      rec.set('generated_by', e.auth.id)
      rec.set('generated_at', agora)
      rec.set('state', 'delivered')
      rec.set('origem', 'api')
      rec.set('data_snapshot_json', rep.get('data_snapshot_json'))
      rec.set('coverage_by_source', rep.get('coverage_by_source'))
      rec.set('comparison_eligibility', rep.get('comparison_eligibility'))
      rec.set('warnings', rep.get('warnings'))
      rec.set('alert_refs', rep.get('alert_refs'))
      rec.set('decision_refs', rep.get('decision_refs'))
      // revisão N+2 SEM resumo — só o registro da retirada
      rec.set('resumo_publicado', '')
      rec.set('resumo_revisao_registro', registro)
      txApp.save(rec)
      reportId = rec.id
      for (const uid of destOk) {
        const item = new Record(colI)
        item.set('report_id', reportId)
        item.set('user_id', uid)
        item.set('scope', rep.get('scope'))
        item.set('status', 'delivered')
        item.set('attempts', 1)
        item.set('delivered_at', agora)
        txApp.save(item)
      }
    })
    sum.set('estado', 'retirado')
    sum.set('revisado_por', e.auth.id)
    sum.set('revisado_em', agora)
    sum.set('revisao_nota', ('retirado: ' + nota).slice(0, 500))
    $app.save(sum)
    return e.json(200, {
      ok: true,
      estado: 'retirado',
      id: reportId,
      report_revision: novaRev,
      resumo_revisao_registro: registro,
      replay: false,
      avisos: avisos,
    })
  },
  $apis.requireAuth(),
)
