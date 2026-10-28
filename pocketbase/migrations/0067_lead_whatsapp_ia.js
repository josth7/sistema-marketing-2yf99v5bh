/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0067 — campos de WhatsApp e IA no lead (SPEC-3-005, aditivo).
 *
 * O webhook precisa saber por qual número o lead entrou e a IA vai gravar nota,
 * humor e canal do atendimento. Nada mais muda em crm_leads.
 *
 * Campos como PLAIN OBJECTS (lição reincidente 08/10).
 */

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('crm_leads')

    function tem(nome) {
      try {
        return !!col.fields.getByName(nome)
      } catch (e) {
        return false
      }
    }

    let mudou = false
    if (!tem('entrada_whatsapp')) {
      col.fields.add(new TextField({ name: 'entrada_whatsapp', max: 40 }))
      mudou = true
    }
    if (!tem('canal_atendimento')) {
      col.fields.add(
        new SelectField({
          name: 'canal_atendimento',
          maxSelect: 1,
          values: ['google', 'meta', 'organico', 'sem_gatilho'],
        }),
      )
      mudou = true
    }
    if (!tem('ia_nota')) {
      col.fields.add(new NumberField({ name: 'ia_nota', min: 0, max: 100 }))
      mudou = true
    }
    if (!tem('ia_humor')) {
      col.fields.add(
        new SelectField({
          name: 'ia_humor',
          maxSelect: 1,
          values: ['positivo', 'neutro', 'negativo', 'raiva', 'ameaca'],
        }),
      )
      mudou = true
    }
    if (!tem('ia_humor_score')) {
      col.fields.add(new NumberField({ name: 'ia_humor_score', min: 0, max: 1 }))
      mudou = true
    }
    if (!tem('ia_atualizado_em')) {
      col.fields.add(new DateField({ name: 'ia_atualizado_em' }))
      mudou = true
    }

    if (mudou) {
      app.save(col)
      console.log(
        '0067: crm_leads ganhou entrada_whatsapp/canal_atendimento/ia_nota/ia_humor/ia_humor_score/ia_atualizado_em',
      )
    }

    // conferência pós-migração
    const check = app.findCollectionByNameOrId('crm_leads')
    const nomes = []
    for (const f of check.fields) nomes.push(f.name)
    console.log('0067: campos de crm_leads = ' + nomes.join(','))
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('crm_leads')
      for (const nome of [
        'entrada_whatsapp',
        'canal_atendimento',
        'ia_nota',
        'ia_humor',
        'ia_humor_score',
        'ia_atualizado_em',
      ]) {
        try {
          if (col.fields.getByName(nome)) col.fields.removeByName(nome)
        } catch (e) {}
      }
      app.save(col)
    } catch (e2) {}
    console.log('0067 revertida')
  },
)
