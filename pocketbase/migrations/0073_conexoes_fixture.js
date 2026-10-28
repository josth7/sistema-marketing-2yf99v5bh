/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0073 — conexões FIXTURE para o teste da transferência (CA-3-16).
 *
 * Existem só para o QA da transferência rodar sem tocar em número real:
 * com o isolamento por `fixture` no hook, uma transferência fixture usa estas
 * conexões e uma transferência real usa as reais — nunca se cruzam.
 *
 * São registros de teste marcados `fixture = true` e `ativo = true`.
 * Não aparecem nas telas de gestão (as rotas filtram fixture).
 */

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_conexoes')

    // vendedor fixture
    var existeVend = []
    try {
      existeVend = app.findRecordsByFilter(
        col,
        "fixture=true && session_id='fixture-vend-qa'",
        '',
        1,
        0,
      )
    } catch (e) {}
    if (!existeVend || existeVend.length === 0) {
      const v = new Record(col)
      v.set('papel', 'vendedor')
      v.set('numero', '5541977770001')
      v.set('nome_exibicao', 'Vendedor FIXTURE QA')
      v.set('vendedor_nome_publico', 'Vendedor Teste')
      v.set('session_id', 'fixture-vend-qa')
      v.set('ativo', true)
      v.set('fixture', true)
      v.set('nome_segredo_chave', 'DAPI_KEY_CENTRAL')
      v.set('guardar_historico', false)
      // liga ao usuário fixture aprovador (existe desde as fases anteriores)
      try {
        const u = app.findRecordsByFilter(
          app.findCollectionByNameOrId('users'),
          "email='criterios.fixture.aprovador@haisan.com.br'",
          '',
          1,
          0,
        )
        if (u && u.length > 0) v.set('vendedor_user', u[0].id)
      } catch (eU) {}
      app.save(v)
      console.log('0073: conexao vendedor fixture criada')
    }

    // central fixture
    var existeCentral = []
    try {
      existeCentral = app.findRecordsByFilter(
        col,
        "fixture=true && session_id='fixture-central-qa'",
        '',
        1,
        0,
      )
    } catch (e2) {}
    if (!existeCentral || existeCentral.length === 0) {
      const c = new Record(col)
      c.set('papel', 'central')
      c.set('numero', '5541977770000')
      c.set('nome_exibicao', 'CENTRAL FIXTURE QA')
      c.set('session_id', 'fixture-central-qa')
      c.set('ativo', true)
      c.set('fixture', true)
      c.set('nome_segredo_chave', 'DAPI_KEY_CENTRAL')
      c.set('guardar_historico', false)
      // sem modelo aprovado: prova o caminho `fora_da_janela_sem_modelo`
      c.set('modelo_aviso_vendedor', '')
      c.set('modelo_transferencia_cliente', '')
      app.save(c)
      console.log('0073: conexao central fixture criada')
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_conexoes')
    try {
      const regs = app.findRecordsByFilter(col, "fixture=true && session_id~'fixture-'", '', 20, 0)
      for (const r of regs) {
        if (String(r.get('session_id') || '').indexOf('fixture-') === 0) app.delete(r)
      }
    } catch (e) {}
    console.log('0073 revertida')
  },
)
