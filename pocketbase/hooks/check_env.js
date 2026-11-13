/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/env',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, enviados: 0, falhas: 0, por_motivo: {}, amostra: [] }
    // os envios para esse numero nos ultimos 2 dias
    const env = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      "destino_telefone~'9036170'",
      '',
      100,
      0,
    )
    for (const x of env) {
      const est = String(x.get('estado') || '')
      const mot = String(x.get('motivo') || '')
      out.por_motivo[mot] = (out.por_motivo[mot] || 0) + 1
      if (est === 'enviado') out.enviados++
      else if (est.indexOf('erro') >= 0) out.falhas++
      if (out.amostra.length < 10)
        out.amostra.push({
          q: String(x.get('created') || '').slice(5, 16),
          mot: mot,
          est: est,
          erro: String(x.get('ultimo_erro') || '').slice(0, 35),
        })
    }
    out.amostra.sort(function (a, b) {
      return a.q < b.q ? -1 : 1
    })
    // TODAS as mensagens de SAIDA naquela conversa (o que o robo falou)
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
    for (const c of cvs) {
      if (String(nomes[String(c.get('conexao') || '')] || '').indexOf('Atendimento') < 0) continue
      const saidas = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "conexao='" +
          String(c.get('conexao')) +
          "' && contato_telefone~'9036170' && direcao='saida'",
        '',
        100,
        0,
      )
      out.saidas_gravadas = saidas.length
      const l = []
      for (const s of saidas)
        l.push(
          String(s.get('created') || '').slice(5, 16) +
            ' ' +
            String(s.get('autor') || '') +
            ' ' +
            String(s.get('texto') || '').slice(0, 30),
        )
      l.sort()
      out.saidas = l
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
