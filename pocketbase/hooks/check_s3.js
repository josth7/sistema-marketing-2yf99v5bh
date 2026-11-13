/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/s3',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, eventos: [], padrao: '' }
    // os eventos do envio que saiu (036170 as 20:36)
    const en = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      "motivo='apresentacao_vendedor' && estado='enviado'",
      '',
      5,
      0,
    )
    if (en.length > 0) {
      const wid = String(en[0].get('wa_message_id') || '')
      out.wamid = wid.slice(-14)
      try {
        const ev = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_eventos'),
          "ref_id='" + wid + "'",
          '',
          10,
          0,
        )
        for (const x of ev)
          out.eventos.push({
            ev: String(x.get('evento') || ''),
            cod: String(x.get('codigo_erro') || '').slice(0, 60),
          })
        if (ev.length === 0)
          out.eventos.push({ ev: '(nenhum evento recebido para este wamid)', cod: '' })
      } catch (e1) {
        out.erro = String(e1).slice(0, 80)
      }
    }
    // padrao: quais destinos deram 5xx? sao numeros de vendedor?
    const cxs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='vendedor' && ativo=true",
      '',
      20,
      0,
    )
    out.telefones_vendedor = []
    for (const c of cxs)
      out.telefones_vendedor.push({
        nome: String(c.get('nome_exibicao') || ''),
        fone: String(c.get('numero') || '').slice(-6),
      })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
