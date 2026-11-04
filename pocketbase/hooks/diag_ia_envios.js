/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO TEMPORÁRIO (04/11) — o que são os envios com motivo `ia_*`.
 *
 * Apareceram 15 envios `ia_resposta` (12 deles hoje) marcados como ENVIADOS,
 * mas o nosso cron enfileira `ia_roteiro`, não `ia_resposta`. Preciso saber,
 * sem adivinhar: o que foi enviado, para quem, por qual conexão, e se existe
 * conversa daquele número.
 *
 * GET /backend/v1/diag/ia-envios
 */
routerAdd(
  'GET',
  '/backend/v1/diag/ia-envios',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const out = { erro_geral: '', total: 0, por_motivo: {}, itens: [], conexoes: {} }

    var envios = []
    try {
      envios = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_envios'),
        '',
        '',
        400,
        0,
      )
    } catch (e0) {
      out.erro_geral = String(e0).slice(0, 300)
      return e.json(200, out)
    }
    out.total = envios.length

    // nomes das conexões
    try {
      const cxs = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_conexoes'),
        '',
        '',
        50,
        0,
      )
      for (const c of cxs) {
        out.conexoes[c.id] =
          String(c.get('numero') || '') +
          ' (' +
          String(c.get('papel') || '') +
          (String(c.get('fixture')) === 'true' ? ', fixture' : '') +
          ')'
      }
    } catch (e1) {}

    const motivos = {}
    for (const en of envios) {
      const m = String(en.get('motivo') || '(vazio)')
      motivos[m] = (motivos[m] || 0) + 1
      if (m.indexOf('ia') !== 0) continue
      const dest = String(en.get('destino_telefone') || '')
      var temConversa = false
      try {
        const cv = $app.findRecordsByFilter(
          $app.findCollectionByNameOrId('whatsapp_conversas'),
          "contato_telefone='" + dest + "'",
          '',
          1,
          0,
        )
        temConversa = cv && cv.length > 0
      } catch (e2) {}
      out.itens.push({
        created: String(en.get('created') || '').slice(0, 19),
        motivo: m,
        estado: String(en.get('estado') || ''),
        destino: dest,
        conexao: out.conexoes[String(en.get('conexao') || '')] || String(en.get('conexao') || ''),
        fixture: String(en.get('fixture')) === 'true',
        wa_id: String(en.get('wa_message_id') || '').slice(0, 34),
        tentativas: en.get('tentativas'),
        ultimo_erro: String(en.get('ultimo_erro') || '').slice(0, 40),
        tem_conversa: temConversa,
        texto: String(en.get('texto') || '').slice(0, 120),
      })
    }
    out.por_motivo = motivos
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
