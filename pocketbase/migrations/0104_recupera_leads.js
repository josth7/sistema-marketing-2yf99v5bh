/// <reference path="../pb_data/types.d.ts" />
// ===================================================================
// MIG 0104 — RECUPERA os leads que o webhook não conseguiu criar (03/11).
//
// CAUSA RAIZ: o webhook gravava `status: 'novo'`, valor que deixou de existir
// quando o funil virou 10 etapas (mig 0097 → `entrada_lead`). O save lançava,
// o catch vazio engolia, e a conversa ficava SEM lead. Resultado medido: 12
// clientes reais (11 do anúncio Google) entraram no WhatsApp e não existiam no
// CRM. Corrigido no hook; esta migração conserta o passado.
//
// O QUE FAZ
//   - varre conversas sem `lead`
//   - cria o lead com nome, telefone, origem e dono da conversa
//   - liga a conversa ao lead
//   - herda a atribuição de anúncio, se houver
//
// SEGURANÇA: se já existir lead com o mesmo telefone, LIGA em vez de criar
// (não duplica). Conversa de teste (fixture) fica fora. Não apaga nada.
// ===================================================================
migrate(
  (app) => {
    const colCv = app.findCollectionByNameOrId('whatsapp_conversas')
    const colL = app.findCollectionByNameOrId('crm_leads')
    const colCx = app.findCollectionByNameOrId('whatsapp_conexoes')

    var conversas = []
    try {
      conversas = app.findRecordsByFilter(colCv, "lead='' && fixture=false", '', 2000, 0)
    } catch (e0) {
      console.log('0104: nao consegui listar conversas: ' + e0)
      return
    }
    console.log('0104: ' + conversas.length + ' conversa(s) sem lead')

    // dono de cada conexao (para o lead nascer com o vendedor certo)
    const donoDaConexao = {}
    try {
      const cxs = app.findRecordsByFilter(colCx, '', '', 50, 0)
      for (const c of cxs) {
        donoDaConexao[c.id] = {
          papel: String(c.get('papel') || ''),
          user: String(c.get('vendedor_user') || ''),
          nome: String(c.get('vendedor_nome_publico') || c.get('nome_exibicao') || ''),
        }
      }
    } catch (e1) {}

    var criados = 0
    var ligados = 0
    for (const cv of conversas) {
      const tel = String(cv.get('contato_telefone') || '')
      if (tel === '') continue
      const nome = String(cv.get('contato_nome') || '')
      const cx = donoDaConexao[String(cv.get('conexao') || '')] || { papel: '', user: '', nome: '' }

      // ja existe lead com esse telefone? liga
      var existente = null
      try {
        const r = app.findRecordsByFilter(colL, "telefone='" + tel + "'", '', 1, 0)
        if (r && r.length > 0) existente = r[0]
      } catch (e2) {}

      if (existente) {
        try {
          cv.set('lead', existente.id)
          app.save(cv)
          ligados++
        } catch (e3) {}
        continue
      }

      try {
        const novo = new Record(colL)
        novo.set(
          'nome',
          (nome !== '' ? nome : 'Contato WhatsApp final ' + tel.slice(-4)).slice(0, 200),
        )
        novo.set('telefone', tel)
        // canal da conversa decide a origem: google/meta vira origem igual
        const canal = String(cv.get('canal') || '')
        var origem = 'whatsapp'
        if (canal === 'google') origem = 'google'
        else if (canal === 'meta') origem = 'meta'
        else if (canal === 'organico') origem = 'organico'
        novo.set('origem', origem)
        novo.set('status', 'entrada_lead')
        novo.set('conta_id', 'haisan')
        novo.set('fixture', false)
        novo.set('entrada_whatsapp', String(cv.get('conexao') || ''))
        if (cx.papel === 'vendedor') {
          novo.set('owner_id', cx.user)
          novo.set('vendedor_nome', cx.nome)
        } else {
          novo.set('owner_id', '')
          novo.set('vendedor_nome', '')
        }
        // atribuicao de anuncio, se a conversa tem
        try {
          if (String(cv.get('anuncio_id') || '') !== '')
            novo.set('anuncio_id', String(cv.get('anuncio_id')))
          if (String(cv.get('anuncio_url') || '') !== '')
            novo.set('anuncio_fonte', String(cv.get('anuncio_url')).slice(0, 60))
        } catch (eA) {}
        app.save(novo)

        cv.set('lead', novo.id)
        app.save(cv)
        criados++

        // trilha
        try {
          const colEv = app.findCollectionByNameOrId('crm_lead_events')
          const ev = new Record(colEv)
          ev.set('lead_id', novo.id)
          ev.set('tipo', 'criado')
          ev.set(
            'texto',
            'Lead recuperado em 03/11 (o webhook falhava ao criar: status inválido após o funil de 10 etapas)',
          )
          ev.set('fixture', false)
          app.save(ev)
        } catch (eEv) {}
      } catch (eNovo) {
        console.log('0104: falha ao criar lead para ' + tel + ': ' + String(eNovo))
      }
    }
    console.log(
      '0104 RESULTADO: ' + criados + ' criado(s), ' + ligados + ' ligado(s) a lead existente',
    )
  },
  (app) => {
    // reversivel: apaga os leads criados por esta migracao (marcados na trilha)
    try {
      const colEv = app.findCollectionByNameOrId('crm_lead_events')
      const colL = app.findCollectionByNameOrId('crm_leads')
      const evs = app.findRecordsByFilter(colEv, "texto~'Lead recuperado em 03/11'", '', 2000, 0)
      for (const ev of evs) {
        try {
          const l = app.findRecordById(colL, String(ev.get('lead_id')))
          app.delete(l)
        } catch (e1) {}
      }
    } catch (e0) {}
  },
)
