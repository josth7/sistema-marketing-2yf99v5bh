/// <reference path="../pb_data/types.d.ts" />
/**
 * PILOTO (11/11) — o que chegou do celular de teste?
 *
 * O dono mandou mensagem às 11:10 do número 41989036170 para a central.
 * Aqui se mostra, em ordem: conversa criada, mensagens, lead, e se o robô
 * respondeu.
 *
 * GET /backend/v1/piloto/estado
 */
routerAdd(
  'GET',
  '/backend/v1/piloto/estado',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, conversas: [], mensagens: [], leads: [], rodou: false }

    // variações do telefone (com e sem o 9)
    const TELS = ['41989036170', '5541989036170', '4189036170', '554189036170']

    // conversas
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
          out.conversas.push({
            id: c.id,
            tel: tel,
            nome: String(c.get('contato_nome') || ''),
            estado: String(c.get('estado') || ''),
            numero: String(c.get('numero_nome') || ''),
            msgs: Number(c.get('total_mensagens') || 0),
            ultima: String(c.get('ultima_mensagem_em') || c.get('created') || '').slice(0, 16),
            empresa: String(c.get('empresa') || '').slice(0, 10),
            ia_bloqueada: String(c.get('ia_bloqueada') || ''),
          })
        }
      } catch (e1) {}
    }

    // mensagens
    for (const tel of TELS) {
      try {
        const msgs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_mensagens'),
          "contato_telefone='" + tel + "'",
          '',
          40,
          0,
        )
        for (const m of msgs) {
          out.mensagens.push({
            dir: String(m.get('direcao') || ''),
            autor: String(m.get('autor') || ''),
            texto: String(m.get('texto') || '').slice(0, 90),
            quando: String(m.get('created') || '').slice(11, 16),
            status: String(m.get('status') || ''),
          })
        }
      } catch (e2) {}
    }
    // ordena por hora
    out.mensagens.sort(function (a, b) {
      return a.quando < b.quando ? -1 : 1
    })

    // leads
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
          var donoNome = ''
          try {
            const d = String(l.get('owner_id') || '')
            if (d !== '') donoNome = String(app.findRecordById('users', d).get('name') || '')
          } catch (eD) {}
          out.leads.push({
            nome: String(l.get('nome') || ''),
            status: String(l.get('status') || ''),
            origem: String(l.get('origem') || ''),
            canal: String(l.get('canal_atendimento') || ''),
            dono: donoNome,
            ia_nota: l.get('ia_nota'),
            ia_humor: String(l.get('ia_humor') || ''),
            ia_resumo: String(l.get('ia_resumo') || '').slice(0, 120),
            anuncio: String(l.get('anuncio_id') || ''),
            criado: String(l.get('created') || '').slice(0, 16),
          })
        }
      } catch (e3) {}
    }

    out.rodou = out.conversas.length > 0 || out.mensagens.length > 0
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
