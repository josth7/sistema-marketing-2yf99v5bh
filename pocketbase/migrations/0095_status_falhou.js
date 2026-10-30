/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0095 — status `falhou` em whatsapp_mensagens (30/10).
 *
 * A Meta marca envio que não chegou como `failed`. O nosso campo `status` só
 * aceitava recebida/enviada/entregue/lida — então a mensagem falhada ficava
 * para sempre como "enviada" e a tela mentia (mostrava entregue o que nunca
 * saiu). O webhook agora grava `falhou`, mas o valor precisa existir no select.
 */

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_mensagens')
    var campo = null
    for (const f of col.fields) {
      if (f.name === 'status') campo = f
    }
    if (!campo) {
      console.log('0095: campo status nao encontrado')
      return
    }
    var vals = []
    try {
      vals = campo.values || []
    } catch (e0) {}
    var mudou = false
    if (vals.indexOf('falhou') < 0) {
      vals.push('falhou')
      campo.values = vals
      mudou = true
    }
    // whatsapp_eventos.codigo_erro tem max 60 — o motivo da Meta não cabe
    // (o save falhava em silêncio e o diagnóstico ficava vazio)
    var colEv = null
    try {
      colEv = app.findCollectionByNameOrId('whatsapp_eventos')
    } catch (e2) {}
    if (colEv) {
      for (const f of colEv.fields) {
        if (f.name === 'codigo_erro' && Number(f.max || 0) < 1000) {
          f.max = 1000
          mudou = true
        }
      }
      try {
        app.save(colEv)
      } catch (e3) {}
    }
    if (mudou) {
      try {
        app.save(col)
        console.log('0095: status falhou + codigo_erro 1000 ok')
      } catch (e1) {
        console.log('0095: falhou -> ' + String(e1).slice(0, 180))
      }
    }
  },
  (app) => {
    console.log('0095 revertida')
  },
)
