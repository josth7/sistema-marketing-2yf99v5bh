/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0158 — estado do Google na conversão (CA-3-65, 06/11).
 *
 * A tela Conversões mostra o estado **das duas plataformas**. O campo da Meta
 * já existe (`estado`); falta o do Google, que o Maestro preenche quando envia
 * pelo conector (CA-3-61).
 *
 * `estado_google` nasce vazio = "não configurado", para a tela não mentir
 * dizendo "enviado" o que nunca foi tentado.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('conversion_events')
    const nomes = []
    try {
      for (const f of col.fields || []) nomes.push(String(f.name))
    } catch (e0) {}

    if (nomes.indexOf('estado_google') < 0) {
      try {
        col.fields.add(new TextField({ name: 'estado_google', max: 30 }))
        console.log('0158: estado_google criado')
      } catch (e1) {}
    }
    if (nomes.indexOf('erro_google') < 0) {
      try {
        col.fields.add(new TextField({ name: 'erro_google', max: 300 }))
        console.log('0158: erro_google criado')
      } catch (e2) {}
    }
    if (nomes.indexOf('enviado_google_em') < 0) {
      try {
        col.fields.add(new DateField({ name: 'enviado_google_em' }))
        console.log('0158: enviado_google_em criado')
      } catch (e3) {}
    }
    try {
      app.save(col)
      console.log('0158: pronto')
    } catch (e4) {
      console.log('0158: falhou -> ' + String(e4).slice(0, 150))
    }
  },
  (app) => {
    console.log('0158 revertida (campos permanecem)')
  },
)
