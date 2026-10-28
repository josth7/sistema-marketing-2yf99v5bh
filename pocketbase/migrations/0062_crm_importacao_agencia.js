/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0062 — importação da base da agência (Movienari) para o CRM.
 *
 * A planilha da agência traz informação que o CRM não tinha onde guardar:
 * - `Valor`   → valor da negociação/venda (R$ 70.000 em 8 vendas fechadas + R$ 57.210 em pipeline)
 * - `Responsável` → vendedor dono do lead (Fábio/Douglas/Adriana/Elisangela)
 * - `Etapa`   → a etapa original de 11 estágios da agência (nosso funil tem 5)
 * - `ID`      → id do lead na agência (rastreabilidade da migração)
 * - `Anúncio`/`Score`/`Etiquetas`/`Produtos` → colunas existentes, guardadas em texto
 *
 * Campos novos:
 * - valor            (number)  valor da negociação/venda
 * - vendedor_nome    (text)    nome do vendedor na origem (sem usuário no sistema ainda)
 * - etapa_origem     (text)    etapa da agência de onde o lead veio
 * - id_externo       (text)    ID na agência
 * - tags_origem      (text)    Etiquetas/Produtos da planilha
 *
 * `origem` ganha o valor `organico` (a planilha tem "Marketing Orgânico", 124 leads).
 * Telefones gravados como só dígitos com 55 (padrão do WhatsApp oficial da SPEC-3-005).
 *
 * Campos como PLAIN OBJECTS (lição reincidente 08/10).
 */

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('crm_leads')

    function tem(nome) {
      try {
        return !!col.fields.getByName(nome)
      } catch (e) {
        return false
      }
    }

    let mudou = false
    if (!tem('valor')) {
      col.fields.add(new NumberField({ name: 'valor', min: 0 }))
      mudou = true
    }
    if (!tem('vendedor_nome')) {
      col.fields.add(new TextField({ name: 'vendedor_nome', max: 120 }))
      mudou = true
    }
    if (!tem('etapa_origem')) {
      col.fields.add(new TextField({ name: 'etapa_origem', max: 80 }))
      mudou = true
    }
    if (!tem('id_externo')) {
      col.fields.add(new TextField({ name: 'id_externo', max: 40 }))
      mudou = true
    }
    if (!tem('tags_origem')) {
      col.fields.add(new TextField({ name: 'tags_origem', max: 500 }))
      mudou = true
    }

    // origem: inclui `organico` (Marketing Orgânico da planilha)
    try {
      const campoOrigem = col.fields.getByName('origem')
      if (campoOrigem && campoOrigem.values.indexOf('organico') < 0) {
        campoOrigem.values.push('organico')
        mudou = true
      }
    } catch (eO) {}

    if (mudou) {
      app.save(col)
      console.log(
        '0062: crm_leads ganhou valor/vendedor_nome/etapa_origem/id_externo/tags_origem + origem organico',
      )
    }

    // índices de apoio (vendedor e id externo)
    try {
      const c2 = app.findCollectionByNameOrId('crm_leads')
      const idx = c2.indexes.join(' ')
      if (idx.indexOf('idx_crm_leads_vendedor') < 0) {
        c2.indexes.push('CREATE INDEX idx_crm_leads_vendedor ON crm_leads (vendedor_nome)')
        app.save(c2)
        console.log('0062: índice idx_crm_leads_vendedor criado')
      }
    } catch (eI) {
      console.log('0062: índice de vendedor não criado: ' + eI)
    }

    // conferência pós-migração (lição: conferir schema depois de mexer)
    const check = app.findCollectionByNameOrId('crm_leads')
    const nomes = []
    for (const f of check.fields) nomes.push(f.name)
    console.log('0062: campos de crm_leads = ' + nomes.join(','))
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('crm_leads')
      for (const nome of ['valor', 'vendedor_nome', 'etapa_origem', 'id_externo', 'tags_origem']) {
        try {
          if (col.fields.getByName(nome)) col.fields.removeByName(nome)
        } catch (e) {}
      }
      try {
        const campoOrigem = col.fields.getByName('origem')
        const pos = campoOrigem.values.indexOf('organico')
        if (pos >= 0) campoOrigem.values.splice(pos, 1)
      } catch (e2) {}
      app.save(col)
    } catch (e3) {}
    console.log('0062 revertida')
  },
)
