/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0173 — guarda na conversa a linha que o cliente escolheu (13/11).
 *
 * **Pedido da gestão (12/11):** o cliente respondeu "barbearia" e, duas
 * perguntas depois, o robô ofereceu "maca" e "móvel para manicure". As opções
 * da pergunta de necessidade (etapa e3b → e3c) passam a seguir a linha.
 *
 * Campo novo: `whatsapp_conversas.linha` (barbearia, salao, podologia,
 * manicure, manutencao). Conversa antiga fica vazia e recebe a pergunta
 * completa, como hoje.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_conversas')
    var tem = false
    try {
      for (const f of col.fields || []) if (String(f.name) === 'linha') tem = true
    } catch (e0) {}
    if (tem) {
      console.log('0173: campo linha ja existe')
      return
    }
    col.fields.add(new TextField({ name: 'linha', max: 20 }))
    app.save(col)
    console.log('0173: campo linha criado em whatsapp_conversas')
  },
  (app) => {
    console.log('0173 revertida (campo permanece)')
  },
)
