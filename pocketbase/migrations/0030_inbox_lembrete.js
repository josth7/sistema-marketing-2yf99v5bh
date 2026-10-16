/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0030 — inbox_items vira caixa multi-tipo (SPEC-2-003, card a434ca96, CA-2-09).
 *
 * O lembrete de revisão vencida entra na MESMA caixa de entrada (entrega interna
 * autenticada — SPEC: "nenhuma mensagem externa"). Campos ADITIVOS (padrão 0024,
 * construtores tipados — AP-2026-10-07-1420):
 * - decision_id: decisão que gerou o lembrete (report_id fica vazio)
 * - tipo: 'relatorio' (padrão — itens existentes) | 'lembrete'
 * - dedupe_key: chave de idempotência do lembrete (decision_id+revision+review_date+user)
 *
 * Idempotência do lembrete: a rota do job consulta dedupe_key ANTES de criar
 * (padrão do republish — índice SQL cru é instável no JSVM, 0019).
 * Reagendamento: lembretes pendentes antigos ganham status 'cancelled'
 * (valor novo no select) — trilha preservada, sem notificar de novo.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('inbox_items')

    // report_id era required (0018) — lembrete não tem relatório; relaxar
    try {
      const fRep = col.fields.getByName('report_id')
      if (fRep && fRep.required) {
        fRep.required = false
        app.save(col)
        console.log('migração 0030: report_id.required relaxado (lembrete sem relatório)')
      }
    } catch (eR) {
      console.log('migração 0030: report_id não ajustado — ' + String(eR).slice(0, 120))
    }

    let temTipo = false
    try {
      temTipo = !!col.fields.getByName('tipo')
    } catch (e) {}
    if (!temTipo) {
      col.fields.add(
        new SelectField({
          name: 'tipo',
          maxSelect: 1,
          values: ['relatorio', 'lembrete', 'cancelled'],
        }),
      )
      console.log('migração 0030: campo tipo adicionado')
    }
    let temDecision = false
    try {
      temDecision = !!col.fields.getByName('decision_id')
    } catch (e) {}
    if (!temDecision) {
      col.fields.add(new TextField({ name: 'decision_id', max: 30 }))
      console.log('migração 0030: campo decision_id adicionado')
    }
    let temDedupe = false
    try {
      temDedupe = !!col.fields.getByName('dedupe_key')
    } catch (e) {}
    if (!temDedupe) {
      col.fields.add(new TextField({ name: 'dedupe_key', max: 200 }))
      console.log('migração 0030: campo dedupe_key adicionado')
    }
    app.save(col)

    // itens existentes (relatórios) recebem tipo explícito
    const antigos = app.findRecordsByFilter(col, "tipo=''", '', 2000, 0)
    for (const r of antigos) {
      r.set('tipo', 'relatorio')
      app.save(r)
    }
    console.log(
      'migração 0030 aplicada: inbox_items multi-tipo (' + antigos.length + ' itens marcados)',
    )
  },
  (app) => {
    console.log('migração 0030 revertida (campos do lembrete não são removidos — correção)')
  },
)
