/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (09/11) — qual das 3 opções é viável de verdade.
 *
 * A **Opção C** (passar a conversa para o número do vendedor) só funciona se,
 * depois da troca, o vendedor conseguir **responder**. Para responder texto
 * livre, a Meta exige janela de 24h aberta **com aquele número**: precisa de
 * mensagem DO CLIENTE entrando pelo número do vendedor.
 *
 * Aqui se mede: das conversas que estão na central, quantas têm mensagem do
 * cliente nas últimas 24h, e quantas são mais antigas (exigiriam modelo).
 *
 * GET /backend/v1/diag/janela-opcao-c
 */
routerAdd(
  'GET',
  '/backend/v1/diag/janela-opcao-c',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = {
      ok: true,
      na_central: 0,
      cliente_falou_24h: 0,
      mais_de_24h: 0,
      sem_mensagem: 0,
      por_vendedor: {},
    }

    const nomes = {}
    try {
      for (const u of app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        '',
        '',
        300,
        0,
      )) {
        nomes[u.id] = String(u.get('name') || u.get('email') || '')
      }
    } catch (e0) {}

    const cxPapel = {}
    const cxVend = {}
    try {
      for (const c of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        'ativo=true',
        '',
        60,
        0,
      )) {
        cxPapel[c.id] = String(c.get('papel') || '')
        cxVend[c.id] = String(c.get('vendedor_user') || '')
      }
    } catch (e1) {}

    const agora = new Date().getTime()

    // conversas na central, com lead de vendedor
    var convs = []
    try {
      convs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        'fixture=false',
        '',
        8000,
        0,
      )
    } catch (e2) {
      return e.json(200, { ok: false, erro: String(e2).slice(0, 140) })
    }

    for (const cv of convs) {
      const cx = String(cv.get('conexao') || '')
      if (cxPapel[cx] !== 'central') continue
      const lid = String(cv.get('lead') || '')
      if (lid === '') continue
      var lead = null
      try {
        lead = app.findRecordById('crm_leads', lid)
      } catch (e3) {
        continue
      }
      const dono = String(lead.get('owner_id') || '')
      if (dono === '') continue
      const n = nomes[dono] || dono
      if (n.indexOf('Marketing') >= 0) continue

      out.na_central++
      if (!out.por_vendedor[n]) out.por_vendedor[n] = { total: 0, dentro: 0, fora: 0 }
      out.por_vendedor[n].total++

      // última mensagem DO CLIENTE nessa conversa
      var ultimaCliente = 0
      try {
        const msgs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_mensagens'),
          "conexao='" +
            cx +
            "' && contato_telefone='" +
            String(cv.get('contato_telefone') || '') +
            "' && direcao='entrada'",
          '',
          200,
          0,
        )
        for (const m of msgs) {
          const q = new Date(String(m.get('enviada_em') || m.get('created') || '')).getTime()
          if (q > ultimaCliente) ultimaCliente = q
        }
      } catch (e4) {}

      if (ultimaCliente === 0) {
        out.sem_mensagem++
        out.por_vendedor[n].fora++
      } else if (agora - ultimaCliente < 24 * 3600000) {
        out.cliente_falou_24h++
        out.por_vendedor[n].dentro++
      } else {
        out.mais_de_24h++
        out.por_vendedor[n].fora++
      }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
