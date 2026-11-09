/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (09/11) — por que 23 leads ficaram sem dono desde sexta?
 *
 * **SÓ LEITURA.** Não distribui, não altera nada. Responde:
 *   - de onde cada um veio (conexão, anúncio, orgânico);
 *   - se a conexão é da central ou de vendedor;
 *   - se passou pelo rodízio (tem pedido em whatsapp_transferencias?);
 *   - se a carteira tinha o telefone (deveria ir direto ao dono);
 *   - se é número interno, não-cliente, ou telefone inválido;
 *   - a hora: o cron rodou naquele momento?
 *
 * GET /backend/v1/diag/sem-dono
 */
routerAdd(
  'GET',
  '/backend/v1/diag/sem-dono',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = {
      ok: true,
      total: 0,
      por_dia: {},
      por_origem: {},
      por_conexao: {},
      com_pedido_rodizio: 0,
      na_carteira: 0,
      explicacoes: {},
      itens: [],
    }

    var leads = []
    try {
      leads = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '',
        12000,
        0,
      )
    } catch (e0) {
      return e.json(200, { ok: false, erro: String(e0).slice(0, 140) })
    }

    // nomes das conexões
    const nomesCx = {}
    const papelCx = {}
    try {
      for (const c of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        '',
        '',
        60,
        0,
      )) {
        nomesCx[c.id] = String(c.get('nome_exibicao') || '')
        papelCx[c.id] = String(c.get('papel') || '')
      }
    } catch (e1) {}

    for (const l of leads) {
      if (String(l.get('owner_id') || '') !== '') continue
      const st = String(l.get('status') || '')
      if (st === 'descartado') continue

      out.total++
      const dia = String(l.get('created') || '').slice(0, 10)
      out.por_dia[dia] = (out.por_dia[dia] || 0) + 1
      const org = String(l.get('origem') || '(vazio)')
      out.por_origem[org] = (out.por_origem[org] || 0) + 1
      const cxId = String(l.get('entrada_whatsapp') || '')
      const nomeCx = nomesCx[cxId] || '(sem conexao)'
      out.por_conexao[nomeCx] = (out.por_conexao[nomeCx] || 0) + 1

      const tel = String(l.get('telefone') || '').replace(/\D/g, '')

      // passou pelo rodízio?
      var pedidos = 0
      try {
        pedidos = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_transferencias'),
          "lead='" + l.id + "'",
          '',
          10,
          0,
        ).length
      } catch (e2) {}
      if (pedidos > 0) out.com_pedido_rodizio++

      // está na carteira de alguém?
      var naCart = 0
      try {
        naCart = app.findRecordsByFilter(
          app.findCollectionByNameOrId('carteira_contatos'),
          "telefone='" + tel + "'",
          '',
          5,
          0,
        ).length
      } catch (e3) {}
      if (naCart > 0) out.na_carteira++

      // explicação provável
      var explica = ''
      if (pedidos === 0) explica = 'nunca passou pelo rodizio (sem pedido)'
      else explica = 'tem pedido mas ficou sem dono'

      if (out.itens.length < 30) {
        out.itens.push({
          nome: String(l.get('nome') || '').slice(0, 30),
          telefone: tel,
          criado: String(l.get('created') || '').slice(0, 16),
          origem: org,
          conexao: nomeCx,
          papel_conexao: papelCx[cxId] || '',
          anuncio: String(l.get('anuncio_id') || '').slice(0, 20),
          pedidos_rodizio: pedidos,
          na_carteira: naCart,
          explica: explica,
        })
      }
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
