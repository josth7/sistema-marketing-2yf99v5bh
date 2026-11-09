/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0161 — conexão de TESTE para provar o liga/desliga da apresentação.
 *
 * A prova do CA-3-97 precisa ligar e desligar a apresentação sem tocar nos
 * vendedores reais. Esta migração cria uma conexão de teste com chave própria
 * (o segredo DAPI_KEY_CENTRAL existe) e papel `vendedor`.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_conexoes')
    var ja = null
    try {
      const a = app.findRecordsByFilter(col, "session_id='prova-apres-ca397'", '', 1, 0)
      if (a && a.length > 0) ja = a[0]
    } catch (e0) {}
    if (ja) {
      console.log('0161: conexao de prova ja existe')
      return
    }
    try {
      const c = new Record(col)
      c.set('nome_exibicao', 'PROVA Apresentacao (fixture)')
      c.set('session_id', 'prova-apres-ca397')
      c.set('numero', '5541900000001')
      c.set('papel', 'vendedor')
      c.set('ativo', true)
      c.set('nome_segredo_chave', 'DAPI_KEY_CENTRAL')
      c.set('apresentacao_ativa', false)
      c.set('limite_dia_meta', 250)
      c.set('fixture', true)
      app.save(c)
      console.log('0161: conexao de prova criada -> ' + c.id)
    } catch (e1) {
      console.log('0161: falhou -> ' + String(e1).slice(0, 160))
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('whatsapp_conexoes')
      const a = app.findRecordsByFilter(col, "session_id='prova-apres-ca397'", '', 1, 0)
      for (const x of a) app.delete(x)
    } catch (e) {}
  },
)
