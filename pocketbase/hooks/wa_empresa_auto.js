/// <reference path="../pb_data/types.d.ts" />
/**
 * PREENCHE A EMPRESA NOS REGISTROS NOVOS — cron — CA-3-89 (SPEC-3-017).
 *
 * **RED (o defeito, 16/11):** a versão anterior fazia
 * `findRecordsByFilter('empresas','','',2,0)[0]` — a **primeira empresa sem
 * ordem** — e gravava essa empresa em **todo** registro sem `empresa`. Com a
 * Gol 7 criada, isso **misturava** as duas: registro da Gol 7 recebia Haisan e
 * vice-versa. Além disso, incluía `access_grants` na varredura — permissão de
 * pessoa não é dado de negócio e não deve ser carimbada às cegas.
 *
 * **GREEN (a regra):** a empresa vem da **origem** de cada registro:
 *   1. `conexao` → empresa daquela conexão (o caminho mais forte: número que
 *      recebeu/enviou);
 *   2. `destino_telefone` / `contato_telefone` → a conexão da conversa
 *      correspondente, e daí a empresa;
 *   3. `vendedor_user` / `owner_id` / `user_id` → empresa do grant da pessoa.
 * **Só a Haisan quando a origem for da Haisan.** Nada de "primeira empresa".
 *
 * **O que não dá para identificar:** fica **sem empresa** e entra no log com a
 * contagem — melhor invisível do que no tenant errado.
 *
 * `access_grants` **saiu** da varredura (decisão do dono, 16/11).
 */
cronAdd('wa_empresa_auto', '* * * * *', () => {
  try {
    const app = $app

    // ---------- mapa conexão -> empresa (uma leitura por rodada) ----------
    const empDaConexao = {}
    try {
      const cxs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        '',
        '',
        200,
        0,
      )
      for (const c of cxs) {
        const emp = String(c.get('empresa') || '')
        if (emp !== '') empDaConexao[c.id] = emp
      }
    } catch (e0) {}

    // ---------- mapa telefone -> empresa (pela conversa) ----------
    const empDoTelefone = {}
    try {
      const cvs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        '',
        '',
        5000,
        0,
      )
      for (const cv of cvs) {
        const emp = String(cv.get('empresa') || '')
        if (emp === '') continue
        const tel = String(cv.get('contato_telefone') || '')
        if (tel !== '') empDoTelefone[tel] = emp
        // a conexão também vale como pista
        const cx = String(cv.get('conexao') || '')
        if (cx !== '' && empDaConexao[cx] === undefined) empDaConexao[cx] = emp
      }
    } catch (e1) {}

    // ---------- mapa pessoa -> empresa (pelo grant ATIVO) ----------
    // Aqui o grant é LIDO, não gravado: é o grant que diz de que empresa é a
    // pessoa (o `access_grants` saiu da varredura de escrita).
    const empDaPessoa = {}
    try {
      const gs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        "revoked_at=''",
        '',
        500,
        0,
      )
      for (const g of gs) {
        const emp = String(g.get('empresa') || '')
        if (emp === '') continue
        const uid = String(g.get('user_id') || '')
        if (uid !== '' && empDaPessoa[uid] === undefined) empDaPessoa[uid] = emp
      }
    } catch (e2) {}

    // ---------- coleções de negócio (SEM access_grants) ----------
    const NEGOCIO = [
      'whatsapp_mensagens',
      'whatsapp_eventos',
      'whatsapp_conversas',
      'whatsapp_envios',
      'crm_lead_events',
      'crm_leads',
      'whatsapp_transferencias',
      'precisa_acao',
      'inbox_items',
      'conversion_events',
      'whatsapp_sinais',
      'whatsapp_observacoes',
      'carteira_contatos',
      'campanha_destinos',
      'campanhas',
      'metricas_diarias',
      'metricas_diarias_anuncio',
      'anuncios_criativos',
      'paginas_destino',
      'analyses',
      'analysis_events',
      'reports',
      'report_ai_summaries',
      'decisions',
      'alerts',
      'alert_criteria',
      'canal_avisos',
      'canal_estado',
      'fontes_estado',
      'access_audit',
      'admin_config',
      'atendimento_config',
      'opt_out',
      'whatsapp_conexoes',
      'whatsapp_numeros_internos',
      'whatsapp_midia',
      'whatsapp_historico_bruto',
      'whatsapp_avisos_email',
      'concorrentes_obs',
      'analysis_policy',
      'ai_summary_policy',
      'report_policy',
    ]

    // Descobre a empresa de UM registro, pela origem dele.
    function empresaDo(rec) {
      // 1. conexão
      var cx = ''
      try {
        cx = String(rec.get('conexao') || '')
      } catch (eC) {}
      if (cx !== '' && empDaConexao[cx] !== undefined) return empDaConexao[cx]

      // 2. telefone (destino do envio ou contato da mensagem)
      var tel = ''
      try {
        tel = String(rec.get('destino_telefone') || '')
      } catch (eT1) {}
      if (tel === '') {
        try {
          tel = String(rec.get('contato_telefone') || '')
        } catch (eT2) {}
      }
      if (tel === '' && cx !== '') {
        // mensagem guarda conexao + telefone; se não guardou o telefone, tenta
        // pelo próprio número interno cadastrado
        try {
          tel = String(rec.get('numero') || '')
        } catch (eT3) {}
      }
      if (tel !== '' && empDoTelefone[tel] !== undefined) return empDoTelefone[tel]

      // 3. pessoa (vendedor do envio, dono do lead, autor do evento)
      const CAMPOS_PESSOA = ['vendedor_user', 'owner_id', 'user_id', 'autor_user', 'alvo']
      for (const campo of CAMPOS_PESSOA) {
        var uid = ''
        try {
          uid = String(rec.get(campo) || '')
        } catch (eP) {}
        if (uid !== '' && empDaPessoa[uid] !== undefined) return empDaPessoa[uid]
      }

      return ''
    }

    var corrigidos = 0
    var naoIdentificados = 0
    const porColecao = {}

    for (const nome of NEGOCIO) {
      if (corrigidos >= 400) break
      var regs = []
      try {
        // Pega registros SEM empresa. `empresa=''` casa vazio e nulo no PB.
        regs = app.findRecordsByFilter(nome, "empresa=''", '', 200, 0)
      } catch (e3) {
        continue
      }
      for (const r of regs) {
        const emp = empresaDo(r)
        if (emp === '') {
          // não deu para identificar: NÃO carimba (melhor invisível que no
          // tenant errado) e conta para o log
          naoIdentificados++
          porColecao[nome] = (porColecao[nome] || 0) + 1
          continue
        }
        try {
          r.set('empresa', emp)
          app.save(r)
          corrigidos++
        } catch (e4) {}
      }
    }

    if (corrigidos > 0) {
      console.log('wa_empresa_auto: ' + corrigidos + ' registro(s) preenchido(s) pela origem')
    }
    if (naoIdentificados > 0) {
      var det = []
      for (const k in porColecao) det.push(k + '=' + porColecao[k])
      console.log(
        'wa_empresa_auto: ' +
          naoIdentificados +
          ' registro(s) SEM empresa (origem nao identificada): ' +
          det.join(', '),
      )
    }
  } catch (eTop) {
    console.log('wa_empresa_auto: erro -> ' + String(eTop).slice(0, 160))
  }
})
