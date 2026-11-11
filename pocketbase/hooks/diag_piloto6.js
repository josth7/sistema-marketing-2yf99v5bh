/// <reference path="../pb_data/types.d.ts" />
/**
 * A CONVERSA DO PILOTO (11/11) — 41989036170.
 *
 * A conversa existe (criada 14:10:54 UTC = 11:10 BRT) mas não apareceu na
 * varredura por telefone. Aqui se abre por ela: mensagens, lead, e por que o
 * robô não respondeu.
 *
 * GET /backend/v1/piloto/conversa
 */
routerAdd(
  'GET',
  '/backend/v1/piloto/conversa',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, conversa: null, mensagens: [], lead: null }

    // acha a conversa do número
    var cv = null
    try {
      const cvs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "contato_telefone~'89036170'",
        '',
        5,
        0,
      )
      if (cvs.length > 0) cv = cvs[0]
    } catch (e0) {}

    if (!cv) return e.json(200, { ok: false, erro: 'conversa nao encontrada' })

    var cxNome = ''
    try {
      cxNome = String(
        app.findRecordById('whatsapp_conexoes', String(cv.get('conexao'))).get('nome_exibicao') ||
          '',
      )
    } catch (e1) {}

    out.conversa = {
      id: cv.id,
      tel: String(cv.get('contato_telefone') || ''),
      nome: String(cv.get('contato_nome') || ''),
      estado: String(cv.get('estado') || ''),
      conexao: cxNome,
      msgs: Number(cv.get('total_mensagens') || 0),
      ultimo_autor: String(cv.get('ultimo_autor') || ''),
      ultima_previa: String(cv.get('ultima_previa') || '').slice(0, 60),
      ultima_ia: String(cv.get('ultima_resposta_ia_em') || '').slice(0, 19),
      criada: String(cv.get('created') || '').slice(0, 19),
      empresa: String(cv.get('empresa') || '').slice(0, 10),
    }

    // mensagens
    try {
      const msgs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "contato_telefone='" + String(cv.get('contato_telefone')) + "'",
        '',
        50,
        0,
      )
      for (const m of msgs) {
        out.mensagens.push({
          dir: String(m.get('direcao') || ''),
          autor: String(m.get('autor') || ''),
          texto: String(m.get('texto') || '').slice(0, 80),
          quando: String(m.get('created') || '').slice(11, 19),
          status: String(m.get('status') || ''),
        })
      }
      out.mensagens.sort(function (a, b) {
        return a.quando < b.quando ? -1 : 1
      })
    } catch (e2) {}

    // lead
    try {
      const lid = String(cv.get('lead') || '')
      if (lid !== '') {
        const l = app.findRecordById('crm_leads', lid)
        var dono = ''
        try {
          dono = String(app.findRecordById('users', String(l.get('owner_id'))).get('name') || '')
        } catch (eD) {}
        out.lead = {
          nome: String(l.get('nome') || ''),
          status: String(l.get('status') || ''),
          origem: String(l.get('origem') || ''),
          dono: dono,
          nota: l.get('ia_nota'),
          resumo: String(l.get('ia_resumo') || '').slice(0, 100),
          anuncio: String(l.get('anuncio_id') || '').slice(0, 20),
        }
      }
    } catch (e3) {}

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
