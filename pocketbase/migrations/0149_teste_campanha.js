/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0149 — registro do teste da campanha (CA-3-84, 06/11).
 *
 * **Por que o teste precisa ficar gravado:** aprovar sem testar é o caminho
 * para mandar `{{1}}` cru — ou a imagem errada — para milhares de clientes.
 * A aprovação só passa se existir registro de que o teste foi feito, quando
 * e por quem. Não basta a tela "lembrar": isso se perde ao recarregar.
 *
 * Campos: `teste_em` (data), `teste_por` (nome de quem enviou) e
 * `teste_telefones` (JSON dos números usados).
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('campanhas')
    const nomes = []
    try {
      for (const f of col.fields || []) nomes.push(String(f.name))
    } catch (e0) {}

    if (nomes.indexOf('teste_em') < 0) {
      try {
        col.fields.add(new DateField({ name: 'teste_em' }))
        console.log('0149: teste_em criado')
      } catch (e1) {}
    }
    if (nomes.indexOf('teste_por') < 0) {
      try {
        col.fields.add(new TextField({ name: 'teste_por', max: 120 }))
        console.log('0149: teste_por criado')
      } catch (e2) {}
    }
    if (nomes.indexOf('teste_telefones') < 0) {
      try {
        col.fields.add(new TextField({ name: 'teste_telefones', max: 500 }))
        console.log('0149: teste_telefones criado')
      } catch (e3) {}
    }
    try {
      app.save(col)
      console.log('0149: pronto')
    } catch (e4) {
      console.log('0149: falhou -> ' + String(e4).slice(0, 150))
    }
  },
  (app) => {
    console.log('0149 revertida (campos permanecem)')
  },
)
