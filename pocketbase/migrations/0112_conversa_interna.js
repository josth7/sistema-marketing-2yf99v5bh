/// <reference path="../pb_data/types.d.ts" />
// ===================================================================
// MIG 0112 — conversa da EQUIPE separada da conversa com CLIENTE (CA-3-25).
//
// Pedido do dono: "separar as conversas da equipe das conversas com clientes".
//
// Já existe `whatsapp_numeros_internos` (mig 0081) com os telefones da equipe.
// O webhook usava essa lista só para DESCARTAR a mensagem — então a conversa
// interna desaparecia. Aqui a coluna `interna` na conversa permite guardar e
// mostrar separado.
//
// Regras:
//   interna=true  → número da equipe: não vira lead, não entra na triagem,
//                   o robô nunca responde. Aparece na aba "Equipe".
//   interna=false → cliente normal (padrão; nada muda para o que já existe).
// ===================================================================
migrate(
  (app) => {
    var col = null
    try {
      col = app.findCollectionByNameOrId('whatsapp_conversas')
    } catch (e0) {
      console.log('0112: whatsapp_conversas nao existe')
      return
    }

    var tem = false
    try {
      tem = col.fields.getByName('interna') !== null
    } catch (e1) {
      tem = false
    }
    if (tem) {
      console.log('0112: campo interna ja existe')
      return
    }

    try {
      col.fields.add(new BoolField({ name: 'interna' }))
      app.save(col)
      console.log('0112: whatsapp_conversas ganhou o campo interna')
    } catch (e2) {
      console.log('0112: falha ao criar o campo: ' + String(e2).slice(0, 160))
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('whatsapp_conversas')
      const f = col.fields.getByName('interna')
      if (f) col.fields.removeById(f.id)
      app.save(col)
    } catch (e0) {}
  },
)
