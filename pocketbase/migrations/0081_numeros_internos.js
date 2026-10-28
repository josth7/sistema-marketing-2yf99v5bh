/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0081 — números internos da empresa (piloto, 28/10).
 *
 * O que aconteceu: o Josth mandou "OI" para o número central a partir do
 * (41) 3035-9355, que é uma LINHA INTERNA do atendimento — não um cliente.
 * A regra RN-58 ("mensagem entre números da empresa é ignorada") existia, mas
 * só reconhecia números cadastrados em `whatsapp_conexoes`. Como a linha
 * interna não é uma conexão da D-API, a mensagem passou e criou um lead
 * "Desenvolvimento" no CRM — lixo.
 *
 * Esta migração:
 *   1. cria `whatsapp_numeros_internos`, a lista de números da própria empresa
 *      (a gestão acrescenta outros sem precisar de código);
 *   2. cadastra os números conhecidos;
 *   3. limpa o lead/conversa de teste criados pela mensagem do Josth.
 *
 * A limpeza apaga só o que foi identificado como teste: lead cujo telefone
 * está na lista de internos E que nasceu com origem whatsapp.
 */

migrate(
  (app) => {
    // ---------- 1. coleção ----------
    var col = null
    try {
      col = app.findCollectionByNameOrId('whatsapp_numeros_internos')
    } catch (e0) {}

    if (!col) {
      col = new Collection({
        name: 'whatsapp_numeros_internos',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'numero', type: 'text', max: 20, required: true },
          { name: 'rotulo', type: 'text', max: 120 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_wa_internos_numero ON whatsapp_numeros_internos (numero)',
        ],
      })
      app.save(col)
      console.log('0081: coleção whatsapp_numeros_internos criada')
    }

    // ---------- 2. números internos conhecidos ----------
    const internos = [
      { numero: '554130359355', rotulo: 'Atendimento — linha interna (Desenvolvimento)' },
      { numero: '554130359361', rotulo: 'Atendimento Haisan — número central' },
      { numero: '554132833667', rotulo: 'Vendas Haisan — fixo' },
    ]
    for (const item of internos) {
      var existe = []
      try {
        existe = app.findRecordsByFilter(col, "numero='" + item.numero + "'", '', 1, 0)
      } catch (e1) {}
      if (existe && existe.length > 0) continue
      try {
        const novo = new Record(col)
        novo.set('numero', item.numero)
        novo.set('rotulo', item.rotulo)
        app.save(novo)
        console.log('0081: interno cadastrado ' + item.numero)
      } catch (e2) {
        console.log('0081: falhou ' + item.numero + ' -> ' + String(e2).slice(0, 100))
      }
    }

    // ---------- 3. limpeza do que a mensagem de teste criou ----------
    const colLeads = app.findCollectionByNameOrId('crm_leads')
    const colConv = app.findCollectionByNameOrId('whatsapp_conversas')
    const colMsg = app.findCollectionByNameOrId('whatsapp_mensagens')

    for (const item of internos) {
      var leads = []
      try {
        leads = app.findRecordsByFilter(
          colLeads,
          "telefone='" + item.numero + "' && origem='whatsapp'",
          '',
          50,
          0,
        )
      } catch (e3) {}
      for (const l of leads) {
        // conversa e mensagens do lead
        var convs = []
        try {
          convs = app.findRecordsByFilter(colConv, "lead='" + l.id + "'", '', 100, 0)
        } catch (e4) {}
        for (const c of convs) {
          var msgs = []
          try {
            msgs = app.findRecordsByFilter(colMsg, "conversa='" + c.id + "'", '', 500, 0)
          } catch (e5) {}
          for (const m of msgs) {
            try {
              app.delete(m)
            } catch (e6) {}
          }
          // sinais da conversa (tempo real)
          try {
            const colSin = app.findCollectionByNameOrId('whatsapp_sinais')
            const sins = app.findRecordsByFilter(colSin, "conversa='" + c.id + "'", '', 10, 0)
            for (const s of sins) {
              try {
                app.delete(s)
              } catch (e7) {}
            }
          } catch (e8) {}
          try {
            app.delete(c)
          } catch (e9) {}
        }
        try {
          app.delete(l)
          console.log('0081: lead interno removido ' + item.numero)
        } catch (e10) {}
      }
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('whatsapp_numeros_internos')
      app.delete(col)
    } catch (e) {}
    console.log('0081 revertida')
  },
)
