/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0080 — corrige `enviada_em` de mensagens gravadas com timestamp em
 * segundos tratado como milissegundos (piloto, 28/10).
 *
 * A primeira mensagem REAL do piloto (celular do Josth → número central)
 * entrou com data 1970-01-21 porque a D-API manda `timestamp` em segundos.
 * O hook já foi corrigido; esta migração conserta o que ficou gravado.
 *
 * Regra: só toca mensagens com data anterior a 2020 (impossível para este
 * projeto, que nasceu em 2026) — assim nenhuma mensagem legítima é alterada.
 */

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_mensagens')
    var antigas = []
    try {
      antigas = app.findRecordsByFilter(col, "enviada_em < '2020-01-01'", '', 500, 0)
    } catch (e0) {
      console.log('0080: filtro falhou -> ' + String(e0).slice(0, 120))
      return
    }
    var corrigidas = 0
    for (const m of antigas) {
      const atual = String(m.get('enviada_em') || '')
      if (atual === '') continue
      const ms = new Date(atual).getTime()
      if (isNaN(ms) || ms <= 0) continue
      // estava em segundos: multiplica por 1000
      const certo = new Date(ms * 1000).toISOString()
      m.set('enviada_em', certo)
      try {
        app.save(m)
        corrigidas = corrigidas + 1
      } catch (e1) {}
    }
    console.log('0080: mensagens corrigidas = ' + String(corrigidas))

    // a conversa mostra a prévia pela última mensagem: atualiza as afetadas
    try {
      const colC = app.findCollectionByNameOrId('whatsapp_conversas')
      const convs = app.findRecordsByFilter(colC, "ultima_mensagem_em < '2020-01-01'", '', 200, 0)
      var cfix = 0
      for (const c of convs) {
        const atual = String(c.get('ultima_mensagem_em') || '')
        if (atual === '') continue
        const ms = new Date(atual).getTime()
        if (isNaN(ms) || ms <= 0) continue
        c.set('ultima_mensagem_em', new Date(ms * 1000).toISOString())
        try {
          app.save(c)
          cfix = cfix + 1
        } catch (e2) {}
      }
      console.log('0080: conversas corrigidas = ' + String(cfix))
    } catch (e3) {
      console.log('0080: conversas -> ' + String(e3).slice(0, 120))
    }
  },
  (app) => {
    console.log('0080 revertida (nada a desfazer: os dados estavam errados)')
  },
)
