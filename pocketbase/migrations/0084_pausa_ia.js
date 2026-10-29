/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0084 — pausa da IA por intervenção humana (CA-3-17).
 *
 * O card exige: resposta pelo app da central **pausa** a IA naquela conversa; a
 * resposta da própria IA **não** pausa; "Devolver para a IA" retoma.
 *
 * A coleção já tinha `estado` com o valor `pausada_humano` e o campo
 * `pausada_ate`, mas faltava registrar QUEM pausou e QUANDO, e faltava a rota
 * que devolve a conversa para a IA. Sem o motivo, a tela não consegue explicar
 * por que a IA parou.
 */

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_conversas')

    if (!col.fields.getByName('pausada_motivo')) {
      col.fields.add(new TextField({ name: 'pausada_motivo', max: 160 }))
    }
    if (!col.fields.getByName('pausada_em')) {
      col.fields.add(new DateField({ name: 'pausada_em' }))
    }
    if (!col.fields.getByName('retomada_em')) {
      col.fields.add(new DateField({ name: 'retomada_em' }))
    }
    app.save(col)
    console.log('0084: campos de pausa da IA garantidos')
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('whatsapp_conversas')
      col.fields.removeByName('pausada_motivo')
      col.fields.removeByName('pausada_em')
      col.fields.removeByName('retomada_em')
      app.save(col)
    } catch (e) {}
    console.log('0084 revertida')
  },
)
