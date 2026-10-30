/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0097 — funil de 10 etapas (30/10).
 *
 * O CRM antigo da Haisan (que para de funcionar hoje) trabalha com 10 etapas,
 * e o nosso tinha só 5. Aqui o status passa a aceitar as 10 e os leads que já
 * existem são remapeados, para nada ficar órfão:
 *
 *   novo        → entrada_lead
 *   em_contato  → mql            (cliente respondeu = contato feito)
 *   orcamento   → orcamento
 *   fechado     → venda_realizada
 *   perdido     → descartado
 *
 * Ordem do funil: entrada_lead → pre_atendimento_ia → mql → orcamento →
 * negociacao → aguardando_pagamento → venda_realizada → producao →
 * finalizado → descartado
 */

const DE_PARA = {
  novo: 'entrada_lead',
  em_contato: 'mql',
  orcamento: 'orcamento',
  fechado: 'venda_realizada',
  perdido: 'descartado',
}

const ETAPAS = [
  'entrada_lead',
  'pre_atendimento_ia',
  'mql',
  'orcamento',
  'negociacao',
  'aguardando_pagamento',
  'venda_realizada',
  'producao',
  'finalizado',
  'descartado',
]

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('crm_leads')

    var campo = null
    for (const f of col.fields) {
      if (f.name === 'status') campo = f
    }
    if (!campo) {
      console.log('0097: campo status nao encontrado')
      return
    }

    // o select passa a aceitar as 10 etapas
    campo.values = ETAPAS
    try {
      app.save(col)
      console.log('0097: status agora aceita ' + ETAPAS.length + ' etapas')
    } catch (e1) {
      console.log('0097: falhou ao salvar select -> ' + String(e1).slice(0, 160))
      return
    }

    // remapeia os leads existentes (um UPDATE por etapa de origem)
    var total = 0
    for (const antigo in DE_PARA) {
      const novo = DE_PARA[antigo]
      var lista = []
      try {
        lista = app.findRecordsByFilter('crm_leads', "status='" + antigo + "'", '', 5000, 0)
      } catch (e2) {
        console.log('0097: leitura falhou para ' + antigo)
        continue
      }
      var n = 0
      for (const l of lista) {
        try {
          l.set('status', novo)
          app.save(l)
          n++
        } catch (e3) {}
      }
      total += n
      console.log('0097: ' + antigo + ' -> ' + novo + ' (' + n + ')')
    }
    console.log('0097: total remapeado ' + total)
  },
  (app) => {
    // volta ao conjunto antigo (o que nao mapear fica como novo)
    const col = app.findCollectionByNameOrId('crm_leads')
    var campo = null
    for (const f of col.fields) {
      if (f.name === 'status') campo = f
    }
    if (!campo) return
    campo.values = ['novo', 'em_contato', 'orcamento', 'fechado', 'perdido']
    try {
      app.save(col)
    } catch (e1) {}
    const VOLTA = {
      entrada_lead: 'novo',
      pre_atendimento_ia: 'novo',
      mql: 'em_contato',
      orcamento: 'orcamento',
      negociacao: 'orcamento',
      aguardando_pagamento: 'fechado',
      venda_realizada: 'fechado',
      producao: 'fechado',
      finalizado: 'fechado',
      descartado: 'perdido',
    }
    for (const k in VOLTA) {
      var lista = []
      try {
        lista = app.findRecordsByFilter('crm_leads', "status='" + k + "'", '', 5000, 0)
      } catch (e2) {
        continue
      }
      for (const l of lista) {
        try {
          l.set('status', VOLTA[k])
          app.save(l)
        } catch (e3) {}
      }
    }
    console.log('0097 revertida')
  },
)
