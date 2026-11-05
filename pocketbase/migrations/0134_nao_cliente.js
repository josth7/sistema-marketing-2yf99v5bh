/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0134 — classificar conversa que NÃO é cliente (CA-3-73, 05/11).
 *
 * **O problema:** transportadora, fornecedor, colega de outra empresa — todos
 * entram como "cliente" no CRM e, pior, entram no rodízio. O vendedor recebe
 * um "lead" que é a transportadora ligando para avisar da entrega.
 *
 * **O que faz:** `nao_cliente` na conversa. Marcada, ela sai da aba Clientes e
 * vai para Outros; nova mensagem desse telefone **não cria lead**, **não entra
 * no rodízio** e **o robô não responde**.
 *
 * `nao_cliente_motivo` guarda o rótulo (transportadora, fornecedor, equipe…),
 * para a gestão saber por que aquilo está ali.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_conversas')
    const nomes = []
    try {
      for (const f of col.fields || []) nomes.push(String(f.name))
    } catch (e0) {}

    if (nomes.indexOf('nao_cliente') < 0) {
      try {
        col.fields.add(new BoolField({ name: 'nao_cliente' }))
        console.log('0134: campo nao_cliente criado')
      } catch (e1) {
        console.log('0134: falhou nao_cliente -> ' + String(e1).slice(0, 140))
      }
    }
    if (nomes.indexOf('nao_cliente_motivo') < 0) {
      try {
        col.fields.add(new TextField({ name: 'nao_cliente_motivo', max: 80 }))
        console.log('0134: campo nao_cliente_motivo criado')
      } catch (e2) {
        console.log('0134: falhou motivo -> ' + String(e2).slice(0, 140))
      }
    }
    try {
      app.save(col)
      console.log('0134: pronto')
    } catch (e3) {
      console.log('0134: falhou salvar -> ' + String(e3).slice(0, 160))
    }
  },
  (app) => {
    console.log('0134 revertida (campos permanecem)')
  },
)
