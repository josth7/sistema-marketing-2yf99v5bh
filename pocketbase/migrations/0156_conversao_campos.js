/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0156 — campos do envio de conversão para a Meta (CA-3-59/60, 06/11).
 *
 * **O problema:** a conversão existe em `conversion_events` e fica `pending`
 * para sempre. Ninguém envia para a Meta, então o anúncio nunca aprende com a
 * venda real — ele otimiza para quem clica, não para quem compra.
 *
 * **O que falta na coleção:**
 *   - `event_id`: identidade do evento. A Meta deduplica por ele; sem isso o
 *     mesmo Purchase pode contar duas vezes (entrar, sair e voltar da etapa).
 *   - `event_name`: nome do evento (`Purchase`).
 *   - `ctwa_clid`: o clique do anúncio (Click-to-WhatsApp), que liga a venda ao
 *     anúncio certo.
 *   - `waba_id`: a conta do WhatsApp.
 *   - `tentativas`: quantas vezes já tentou.
 *   - `ultimo_erro`: texto legível da recusa.
 *   - `enviado_em`: quando foi aceito.
 *
 * `estado` já existe; passa a usar `pendente`, `enviado`, `erro`.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('conversion_events')
    const nomes = []
    try {
      for (const f of col.fields || []) nomes.push(String(f.name))
    } catch (e0) {}

    const novos = [
      { name: 'event_id', type: 'text' },
      { name: 'event_name', type: 'text' },
      { name: 'ctwa_clid', type: 'text' },
      { name: 'waba_id', type: 'text' },
      { name: 'tentativas', type: 'number' },
      { name: 'ultimo_erro', type: 'text' },
      { name: 'enviado_em', type: 'date' },
      { name: 'dedupe_key', type: 'text' },
    ]
    for (const n of novos) {
      if (nomes.indexOf(n.name) >= 0) continue
      try {
        if (n.type === 'number') col.fields.add(new NumberField({ name: n.name }))
        else if (n.type === 'date') col.fields.add(new DateField({ name: n.name }))
        else
          col.fields.add(new TextField({ name: n.name, max: n.name === 'ultimo_erro' ? 400 : 200 }))
        console.log('0156: campo criado -> ' + n.name)
      } catch (e1) {
        console.log('0156: falhou ' + n.name + ' -> ' + String(e1).slice(0, 100))
      }
    }
    try {
      app.save(col)
      console.log('0156: pronto')
    } catch (e2) {
      console.log('0156: falhou salvar -> ' + String(e2).slice(0, 150))
    }
  },
  (app) => {
    console.log('0156 revertida (campos permanecem)')
  },
)
