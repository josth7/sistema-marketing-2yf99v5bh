/// <reference path="../pb_data/types.d.ts" />
/**
 * PILOTO 11:42 — o número 41991562937 (11/11).
 *
 * Verifica se a mensagem chegou, em qual número, o estado da conversa e se o
 * robô agiu. Mostra também as variações do telefone (com/sem o 9).
 *
 * GET /backend/v1/piloto/numero
 */
routerAdd(
  'GET',
  '/backend/v1/piloto/numero',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, conversas: [], mensagens: [], leads: [], achou: false }

    // variações: 41991562937 / 5541991562937 / 4191562937 / 554191562937
    const TELS = ['41991562937', '5541991562937', '4191562937', '554191562937']

    for (const tel of TELS) {
      try {
        const cvs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_conversas'),
          "contato_telefone='" + tel + "'",
          '',
          10,
          0,
        )
        for (const c of cvs) {
          var cxNome = ''
          try {
            cxNome = String(
              app
                .findRecordById('whatsapp_conexoes', String(c.get('conexao')))
                .get('nome_exibicao') || '',
            )
          } catch (eCx) {}
          out.achou = true
          out.conversas.push({
            id: c.id,
            tel: tel,
            nome: String(c.get('contato_nome') || ''),
            estado: String(c.get('estado') || ''),
            conexao: cxNome,
            msgs: Number(c.get('total_mensagens') || 0),
            ultimo_autor: String(c.get('ultimo_autor') || ''),
            criada: String(c.get('created') || '').slice(0, 19),
            empresa: String(c.get('empresa') || '').slice(0, 10),
          })
        }
      } catch (e1) {}
    }

    // mensagens de hoje desse telefone (busca ampla)
    try {
      const msgs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "created>='2026-11-11' && direcao='entrada'",
        '',
        200,
        0,
      )
      for (const m of msgs) {
        const t = String(m.get('contato_telefone') || '')
        if (t.indexOf('9156') < 0 && t.indexOf('91562937') < 0) continue
        out.achou = true
        out.mensagens.push({
          tel: t,
          quando: String(m.get('created') || '').slice(11, 19),
          texto: String(m.get('texto') || '').slice(0, 60),
        })
      }
    } catch (e2) {}

    // lead
    for (const tel of TELS) {
      try {
        const ls = app.findRecordsByFilter(
          app.findCollectionByNameOrId('crm_leads'),
          "telefone='" + tel + "'",
          '',
          10,
          0,
        )
        for (const l of ls) {
          var dono = ''
          try {
            dono = String(app.findRecordById('users', String(l.get('owner_id'))).get('name') || '')
          } catch (eD) {}
          out.leads.push({
            nome: String(l.get('nome') || ''),
            tel: tel,
            status: String(l.get('status') || ''),
            dono: dono,
            origem: String(l.get('origem') || ''),
            nota: l.get('ia_nota'),
            criado: String(l.get('created') || '').slice(11, 19),
          })
        }
      } catch (e3) {}
    }

    // o robô: conversas em triagem na central agora
    try {
      var n = 0
      const cvs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "estado='triagem'",
        '',
        3000,
        0,
      )
      for (const c of cvs) {
        var papel = ''
        try {
          papel = String(
            app.findRecordById('whatsapp_conexoes', String(c.get('conexao'))).get('papel') || '',
          )
        } catch (eP) {}
        if (papel === 'central') n++
      }
      out.triagem_na_central = n
    } catch (e4) {}

    out.agora_utc = new Date().toISOString().slice(11, 16)
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
