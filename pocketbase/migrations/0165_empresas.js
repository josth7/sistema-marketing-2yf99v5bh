/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0165 — empresas e o campo `empresa` no dado (CA-3-87, 10/11).
 *
 * **Decisão do consultor (aval de 10/11):**
 *   - `users` fica **global**; o vínculo por empresa é em `access_grants`;
 *   - **só os donos** têm as duas empresas e trocam no topo;
 *   - Haisan e Gol 7 **não compartilham funcionário**.
 *
 * **O que esta migração faz:**
 *   1. cria a coleção `empresas`;
 *   2. cria o registro da **Haisan** (a empresa atual);
 *   3. acrescenta o campo `empresa` em toda coleção de **dado de negócio**;
 *   4. **preenche a Haisan em todos os registros** existentes (contagem antes).
 *
 * **O que ela NÃO faz:** não filtra rota nenhuma. Isso é o CA-3-88, na migração
 * seguinte — e só depois de o campo estar em 100% dos registros.
 */
migrate(
  (app) => {
    // ---------- 1. coleção empresas ----------
    var colE = null
    try {
      colE = app.findCollectionByNameOrId('empresas')
    } catch (e0) {}
    if (!colE) {
      try {
        colE = new Collection({
          name: 'empresas',
          type: 'base',
          fields: [
            { name: 'nome', type: 'text', required: true, max: 120 },
            { name: 'apelido', type: 'text', max: 40 },
            { name: 'cnpj', type: 'text', max: 20 },
            { name: 'ativa', type: 'bool' },
            { name: 'criada_em', type: 'date' },
          ],
        })
        app.save(colE)
        console.log('0165: colecao empresas criada')
      } catch (e1) {
        console.log('0165: falhou criar empresas -> ' + String(e1).slice(0, 150))
        return
      }
    }

    // ---------- 2. Haisan ----------
    var idHaisan = ''
    try {
      const achadas = app.findRecordsByFilter(colE, "cnpj='01.289.282/0001-51'", '', 1, 0)
      if (achadas && achadas.length > 0) {
        idHaisan = achadas[0].id
      } else {
        const h = new Record(colE)
        h.set('nome', 'Haisan Comércio de Móveis Ltda')
        h.set('apelido', 'Haisan')
        h.set('cnpj', '01.289.282/0001-51')
        h.set('ativa', true)
        h.set('criada_em', new Date().toISOString())
        app.save(h)
        idHaisan = h.id
        console.log('0165: empresa Haisan criada')
      }
    } catch (e2) {
      console.log('0165: falhou criar Haisan -> ' + String(e2).slice(0, 150))
      return
    }
    console.log('0165: empresa Haisan = ' + idHaisan)

    // ---------- 3 e 4. campo + preenchimento ----------
    // coleções de DADO DE NEGÓCIO (do inventário aprovado)
    const NEGOCIO = [
      'crm_leads',
      'crm_lead_events',
      'conversion_events',
      'inbox_items',
      'precisa_acao',
      'whatsapp_conexoes',
      'whatsapp_conversas',
      'whatsapp_mensagens',
      'whatsapp_envios',
      'whatsapp_eventos',
      'whatsapp_transferencias',
      'whatsapp_numeros_internos',
      'whatsapp_observacoes',
      'whatsapp_midia',
      'whatsapp_sinais',
      'whatsapp_historico_bruto',
      'whatsapp_avisos_email',
      'atendimento_config',
      'opt_out',
      'carteira_contatos',
      'campanhas',
      'campanha_destinos',
      'metricas_diarias',
      'metricas_diarias_anuncio',
      'anuncios_criativos',
      'paginas_destino',
      'concorrentes_obs',
      'analyses',
      'analysis_events',
      'analysis_policy',
      'ai_summary_policy',
      'report_ai_summaries',
      'reports',
      'report_policy',
      'decisions',
      'alerts',
      'alert_criteria',
      'canal_avisos',
      'canal_estado',
      'fontes_estado',
      'access_grants',
      'access_audit',
      'admin_config',
    ]

    var totalAntes = 0
    var totalDepois = 0
    const relatorio = []

    for (const nome of NEGOCIO) {
      var col = null
      try {
        col = app.findCollectionByNameOrId(nome)
      } catch (e3) {
        continue
      }
      if (!col) continue

      // campo empresa
      var temCampo = false
      try {
        for (const f of col.fields || []) {
          if (String(f.name) === 'empresa') temCampo = true
        }
      } catch (e4) {}
      if (!temCampo) {
        try {
          col.fields.add(new TextField({ name: 'empresa', max: 30 }))
          app.save(col)
        } catch (e5) {
          console.log('0165: falhou campo em ' + nome + ' -> ' + String(e5).slice(0, 90))
          continue
        }
      }

      // preenche
      var regs = []
      try {
        regs = app.findRecordsByFilter(nome, '', '', 200000, 0)
      } catch (e6) {
        continue
      }
      var antes = regs.length
      var preenchidos = 0
      for (const r of regs) {
        totalAntes++
        if (String(r.get('empresa') || '') === '') {
          try {
            r.set('empresa', idHaisan)
            app.save(r)
            preenchidos++
          } catch (e7) {}
        } else {
          preenchidos++
        }
      }
      totalDepois += preenchidos
      if (antes > 0) {
        relatorio.push(nome + ':' + preenchidos + '/' + antes)
      }
    }

    console.log('0165: TOTAL antes=' + totalAntes + ' depois=' + totalDepois)
    console.log('0165: por colecao -> ' + relatorio.slice(0, 45).join(' '))
  },
  (app) => {
    console.log('0165 revertida (empresas e campo permanecem)')
  },
)
