/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/final9036170',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, msgs: [], envios: [], transf: [] }
    const cvs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conversas'),
      "contato_telefone~'9036170'",
      '',
      10,
      0,
    )
    const nomes = {}
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      '',
      '',
      60,
      0,
    ))
      nomes[c.id] = String(c.get('nome_exibicao') || '')
    var alvo = null
    for (const c of cvs)
      if (String(nomes[String(c.get('conexao') || '')] || '').indexOf('Atendimento') >= 0) alvo = c
    if (!alvo) return e.json(200, { ok: false })
    out.conv = {
      estado: String(alvo.get('estado') || ''),
      etapa: String(alvo.get('etapa_atual') || ''),
      autor: String(alvo.get('ultimo_autor') || ''),
      ia: String(alvo.get('ultima_resposta_ia_em') || '').slice(11, 19),
      lead: String(alvo.get('lead') || '').slice(0, 10),
    }
    const ms = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "conexao='" +
        String(alvo.get('conexao')) +
        "' && contato_telefone~'9036170' && created>='2026-11-13 18:40'",
      '',
      40,
      0,
    )
    for (const m of ms)
      out.msgs.push({
        q: String(m.get('created') || '').slice(11, 19),
        dir: String(m.get('direcao') || ''),
        autor: String(m.get('autor') || ''),
        txt: String(m.get('texto') || '').slice(0, 55),
      })
    out.msgs.sort(function (a, b) {
      return a.q < b.q ? -1 : 1
    })
    const env = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      "destino_telefone~'9036170' && created>='2026-11-13 18:40'",
      '',
      30,
      0,
    )
    for (const x of env)
      out.envios.push({
        q: String(x.get('created') || '').slice(11, 19),
        mot: String(x.get('motivo') || ''),
        est: String(x.get('estado') || ''),
        erro: String(x.get('ultimo_erro') || '').slice(0, 45),
        leg: String(x.get('legenda') || '(vazio)').slice(0, 25),
        txt: String(x.get('texto') || '').slice(0, 45),
      })
    out.envios.sort(function (a, b) {
      return a.q < b.q ? -1 : 1
    })
    const lid = String(alvo.get('lead') || '')
    if (lid !== '')
      try {
        const tr = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_transferencias'),
          "lead='" + lid + "'",
          '',
          10,
          0,
        )
        for (const t of tr)
          out.transf.push({
            est: String(t.get('estado') || ''),
            vend: String(t.get('vendedor_nome') || ''),
            q: String(t.get('created') || '').slice(5, 16),
          })
      } catch (e1) {}
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
