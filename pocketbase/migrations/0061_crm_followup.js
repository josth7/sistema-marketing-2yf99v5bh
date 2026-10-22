/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0061 — campos de follow-up e perda no CRM (fase 4.1, PDF da Anezia).
 *
 * - motivo_perda: quando o lead vira "perdido", registra o motivo (§8 do PDF:
 *   "motivos de perda" no painel).
 * - proximo_contato_em: data do próximo retorno prometido ao cliente (§7:
 *   "promessas de contato" → follow-up).
 */

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('crm_leads')
    let mudou = false
    let temMotivo = false
    let temProximo = false
    try {
      temMotivo = !!col.fields.getByName('motivo_perda')
    } catch (e1) {}
    try {
      temProximo = !!col.fields.getByName('proximo_contato_em')
    } catch (e2) {}
    if (!temMotivo) {
      col.fields.add(new TextField({ name: 'motivo_perda', max: 300 }))
      mudou = true
    }
    if (!temProximo) {
      col.fields.add(new DateField({ name: 'proximo_contato_em' }))
      mudou = true
    }
    if (mudou) {
      app.save(col)
      console.log('0061: motivo_perda + proximo_contato_em adicionados a crm_leads')
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('crm_leads')
      try {
        if (col.fields.getByName('motivo_perda')) col.fields.removeByName('motivo_perda')
      } catch (e1) {}
      try {
        if (col.fields.getByName('proximo_contato_em'))
          col.fields.removeByName('proximo_contato_em')
      } catch (e2) {}
      app.save(col)
    } catch (e3) {}
  },
)
