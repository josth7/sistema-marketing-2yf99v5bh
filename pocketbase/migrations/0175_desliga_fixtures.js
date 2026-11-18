/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0175 — desliga as conexões de WhatsApp de teste (18/11).
 *
 * **O defeito:** conexões marcadas `fixture=true` (central e vendedores de
 * prova) continuavam com `ativo=true` e podiam entrar em rodízio, envio e nas
 * telas como se fossem números reais.
 *
 * **O que faz:** `ativo=false` em `whatsapp_conexoes` onde `fixture=true`.
 * Só isso. Não apaga registro nenhum e não toca em conexão real
 * (`fixture=false`).
 *
 * **Reversão:** não religa. A migração não guarda quais estavam ativas antes;
 * religar todas as fixture de uma vez poderia ativar conexão de teste que já
 * estava desligada. Se precisar, religar pela Administração, uma a uma.
 */
migrate(
  (app) => {
    var recs = []
    try {
      recs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        'fixture=true && ativo=true',
        '',
        200,
        0,
      )
    } catch (e0) {
      console.log('0175: falhou listar conexoes fixture -> ' + String(e0).slice(0, 150))
      return
    }
    var n = 0
    for (const r of recs) {
      try {
        r.set('ativo', false)
        app.save(r)
        n++
        console.log('0175: conexao fixture desligada ' + r.id)
      } catch (e1) {
        console.log('0175: falhou desligar ' + r.id + ' -> ' + String(e1).slice(0, 150))
      }
    }
    console.log('0175: ' + n + ' conexao(oes) fixture desligada(s)')
  },
  (app) => {
    // Reversão deliberadamente NÃO religa (ver cabeçalho).
    console.log('0175 revertida (conexoes fixture continuam desligadas de proposito)')
  },
)
