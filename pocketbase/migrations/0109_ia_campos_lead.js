/// <reference path="../pb_data/types.d.ts" />
// ===================================================================
// MIG 0109 — campos de IA no lead (03/11). Card CA-3-23.
//
// A migração 0067 já criou `ia_nota`, `ia_humor`, `ia_humor_score` e
// `ia_atualizado_em`. Faltam os que o card pede:
//
//   ia_resumo         → resumo da conversa (foco no que o CLIENTE disse)
//   ia_justificativa  → por que daquela nota (0-100)
//   ia_calculado_em   → quando foi processado (controle do cron, evita
//                       reprocessar a mesma conversa)
//
// Nome distinto de `ia_atualizado_em` (que já existe) de propósito: aquele é
// carimbo genérico; este é o controle de idempotência do cron.
// ===================================================================
migrate(
  (app) => {
    var col = null
    try {
      col = app.findCollectionByNameOrId('crm_leads')
    } catch (e0) {
      console.log('0109: crm_leads nao existe')
      return
    }

    const tem = (n) => {
      try {
        return col.fields.getByName(n) !== null
      } catch (e) {
        return false
      }
    }

    var mudou = false
    if (!tem('ia_resumo')) {
      col.fields.add(new TextField({ name: 'ia_resumo', max: 2000 }))
      mudou = true
    }
    if (!tem('ia_justificativa')) {
      col.fields.add(new TextField({ name: 'ia_justificativa', max: 500 }))
      mudou = true
    }
    if (!tem('ia_calculado_em')) {
      col.fields.add(new DateField({ name: 'ia_calculado_em' }))
      mudou = true
    }

    if (mudou) {
      try {
        app.save(col)
        console.log('0109: crm_leads ganhou ia_resumo / ia_justificativa / ia_calculado_em')
      } catch (e1) {
        console.log('0109: falha ao salvar: ' + String(e1).slice(0, 160))
      }
    } else {
      console.log('0109: campos ja existiam')
    }
  },
  (app) => {
    // reversível: remove os três campos
    try {
      const col = app.findCollectionByNameOrId('crm_leads')
      for (const n of ['ia_resumo', 'ia_justificativa', 'ia_calculado_em']) {
        try {
          const f = col.fields.getByName(n)
          if (f) col.fields.removeById(f.id)
        } catch (e1) {}
      }
      app.save(col)
    } catch (e0) {}
  },
)
