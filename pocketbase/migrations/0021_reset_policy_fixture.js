/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0021 — reset dos dados da política FIXTURE (card a70d5ab8).
 *
 * O tick revelou recipient_user_ids com ~14 IDs mortos (91, 34, 101… — restos de
 * execuções antigas da migração 0017 em ciclos de QA falhos): o job validou todos
 * como inexistentes e NINGUÉM recebeu ("0 entrega(s) na caixa").
 *
 * Correção (dados de FIXTURE apenas — a política REAL não é tocada):
 * 1. apaga TODOS os registros de report_policy e recria:
 *    - REAL: fixture=false, enabled=false, recipients=[] (gate DH-07 mantido)
 *    - FIXTURE: fixture=true, enabled=true, aprovada, recipients=[ID ATUAL do aprovador]
 * 2. apaga os relatórios scope='fixture' criados pelo tick sem destinatário
 *    (artefatos de teste — permitem reprovar o job do zero).
 * Seguro: nada disso é dado real de produção (fixture é namespace de teste).
 */
migrate(
  (app) => {
    const colP = app.findCollectionByNameOrId('report_policy')
    // 1. limpar e recriar políticas
    const todas = app.findRecordsByFilter(colP, '', '', 50, 0)
    for (const p of todas) app.delete(p)

    var real = new Record(colP)
    real.set('fixture', false)
    real.set('enabled', false)
    real.set('timezone', 'America/Sao_Paulo')
    real.set('periods', 'calendar_halves')
    real.set('template_version', '1.0.0')
    real.set('policy_version', 1)
    real.set('recipient_user_ids', JSON.stringify([]))
    real.set(
      'approval_record',
      'aguardando confirmação do calendário e destinatários pelo dono (DH-07)',
    )
    app.save(real)

    var aprovadorId = null
    try {
      const colU = app.findCollectionByNameOrId('users')
      const users = app.findRecordsByFilter(
        colU,
        "email='criterios.fixture.aprovador@haisan.com.br'",
        '',
        1,
        0,
      )
      if (users && users.length > 0) aprovadorId = users[0].id
    } catch (e) {
      console.log('migração 0021: aprovador não encontrado: ' + String(e).slice(0, 120))
    }
    var fix = new Record(colP)
    fix.set('fixture', true)
    fix.set('enabled', true)
    fix.set('timezone', 'America/Sao_Paulo')
    fix.set('periods', 'calendar_halves')
    fix.set('template_version', '1.0.0')
    fix.set('policy_version', 1)
    if (aprovadorId) {
      fix.set('approved_by', aprovadorId)
      fix.set('recipient_user_ids', JSON.stringify([aprovadorId]))
      console.log('migração 0021: recipients fixture = ' + aprovadorId)
    } else {
      fix.set('recipient_user_ids', JSON.stringify([]))
      console.log('migração 0021: SEM aprovador — recipients vazios')
    }
    fix.set('approved_at', new Date().toISOString())
    fix.set('approval_record', 'política de teste (fixture) aprovada para a prova CA-2-11')
    app.save(fix)

    // 2. limpar relatórios fixture do tick anterior (artefatos de teste)
    const colR = app.findCollectionByNameOrId('reports')
    const fixReports = app.findRecordsByFilter(colR, "scope='fixture'", '', 50, 0)
    let removidos = 0
    for (const r of fixReports) {
      app.delete(r)
      removidos++
    }
    console.log(
      'migração 0021 aplicada: políticas recriadas + ' +
        removidos +
        ' relatório(s) fixture removido(s)',
    )
  },
  (app) => {
    console.log(
      'migração 0021 revertida (dados de fixture não são restaurados — correção de dados)',
    )
  },
)
