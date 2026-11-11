/// <reference path="../pb_data/types.d.ts" />
/**
 * O PILOTO FUNCIONOU? — conversa 252jy5hhg3xflb6 (11/11).
 *
 * A conversa do 41991562937 foi criada na CENTRAL, está `transferida` e o lead
 * ficou com a Adriana. Aqui se mostra a conversa inteira: o que o robô disse,
 * o que o cliente respondeu, e a mensagem de transferência.
 *
 * GET /backend/v1/piloto/prova
 */
routerAdd(
  'GET',
  '/backend/v1/piloto/prova',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, mensagens: [], conversa: null, lead: null, envios: [] }

    var cv = null
    try {
      cv = app.findRecordById('whatsapp_conversas', '252jy5hhg3xflb6')
    } catch (e0) {
      return e.json(200, { ok: false, erro: 'conversa nao encontrada' })
    }

    out.conversa = {
      tel: String(cv.get('contato_telefone') || ''),
      nome: String(cv.get('contato_nome') || ''),
      estado: String(cv.get('estado') || ''),
      ultimo_autor: String(cv.get('ultimo_autor') || ''),
      msgs: Number(cv.get('total_mensagens') || 0),
      criada: String(cv.get('created') || '').slice(0, 19),
    }

    // mensagens pela conexão + telefone
    try {
      const msgs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "conexao='" +
          String(cv.get('conexao')) +
          "' && contato_telefone='" +
          String(cv.get('contato_telefone')) +
          "'",
        '',
        60,
        0,
      )
      for (const m of msgs) {
        out.mensagens.push({
          dir: String(m.get('direcao') || ''),
          autor: String(m.get('autor') || ''),
          texto: String(m.get('texto') || '').slice(0, 100),
          quando: String(m.get('created') || '').slice(11, 19),
        })
      }
      out.mensagens.sort(function (a, b) {
        return a.quando < b.quando ? -1 : 1
      })
    } catch (e1) {}

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
          dono: dono,
          origem: String(l.get('origem') || ''),
          canal: String(l.get('canal_atendimento') || ''),
          nota: l.get('ia_nota'),
          humor: String(l.get('ia_humor') || ''),
          resumo: String(l.get('ia_resumo') || '').slice(0, 120),
        }
      }
    } catch (e2) {}

    // envios ligados a esse telefone
    try {
      const envs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_envios'),
        "destino_telefone='" + String(cv.get('contato_telefone')) + "'",
        '',
        20,
        0,
      )
      for (const en of envs) {
        out.envios.push({
          motivo: String(en.get('motivo') || ''),
          estado: String(en.get('estado') || ''),
          texto: String(en.get('texto') || '').slice(0, 70),
          quando: String(en.get('created') || '').slice(11, 19),
        })
      }
    } catch (e3) {}

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
