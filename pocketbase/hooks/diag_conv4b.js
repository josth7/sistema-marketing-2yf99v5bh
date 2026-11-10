/// <reference path="../pb_data/types.d.ts" />
/**
 * ESTADO DOS 4 ENVIOS DE APRESENTAÇÃO (10/11) — CA-3-114.
 *
 * Mostra, para cada um dos 4 envios de prova: estado na fila, se tem wamid e
 * quais eventos voltaram (delivered/read). É a evidência do card.
 *
 * GET /backend/v1/diag/estado-conv4b
 */
routerAdd(
  'GET',
  '/backend/v1/diag/estado-conv4b',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, itens: [] }

    var es = []
    try {
      es = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_envios'),
        "dedupe_key~'apres4|'",
        '',
        20,
        0,
      )
    } catch (e0) {
      return e.json(200, { ok: false, erro: String(e0).slice(0, 120) })
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
        nomes[u.id] = String(u.get('name') || '')
      }
    } catch (e1) {}

    const nomesCx = {}
    try {
      for (const c of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        '',
        '',
        60,
        0,
      )) {
        nomesCx[c.id] = String(c.get('nome_exibicao') || '')
      }
    } catch (e2) {}

    for (const en of es) {
      const wid = String(en.get('wa_message_id') || '')
      var tipos = []
      if (wid !== '') {
        try {
          const evs = app.findRecordsByFilter(
            app.findCollectionByNameOrId('whatsapp_eventos'),
            "ref_id='" + wid + "'",
            '',
            5,
            0,
          )
          for (const x of evs) tipos.push(String(x.get('evento') || ''))
        } catch (e3) {}
      }
      out.itens.push({
        numero: nomesCx[String(en.get('conexao') || '')] || '?',
        estado: String(en.get('estado') || ''),
        erro: String(en.get('ultimo_erro') || '').slice(0, 60),
        tem_wamid: wid !== '',
        eventos: tipos,
        destino: String(en.get('destino_telefone') || '').slice(-6),
        quando: String(en.get('enviado_em') || en.get('created') || '').slice(0, 16),
      })
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
