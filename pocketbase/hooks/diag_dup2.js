/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (05/11) — os dois registros que pareciam duplicados.
 *
 * GET /backend/v1/diag/dup2?tel=554196778927
 */
routerAdd(
  'GET',
  '/backend/v1/diag/dup2',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const tel = String(e.request.url.query().get('tel') || '554196778927')
    const out = { tel: tel, registros: [] }
    var convs = []
    try {
      convs = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_conversas'),
        "contato_telefone='" + tel + "'",
        '',
        20,
        0,
      )
    } catch (e0) {
      out.erro = String(e0).slice(0, 120)
      return e.json(200, out)
    }
    const nomesCx = {}
    try {
      for (const c of $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_conexoes'),
        '',
        '',
        50,
        0,
      )) {
        nomesCx[c.id] = String(c.get('nome_exibicao') || c.get('papel') || '')
      }
    } catch (e1) {}
    for (const c of convs) {
      const cxId = String(c.get('conexao') || '')
      var msgs = 0
      try {
        msgs = $app.findRecordsByFilter(
          $app.findCollectionByNameOrId('whatsapp_mensagens'),
          "conexao='" + cxId + "' && contato_telefone='" + tel + "'",
          '',
          2000,
          0,
        ).length
      } catch (e2) {}
      out.registros.push({
        id: c.id,
        conexao: cxId,
        conexao_nome: nomesCx[cxId] || '(nao achada)',
        fixture: String(c.get('fixture')) === 'true',
        estado: String(c.get('estado') || ''),
        total_mensagens: c.get('total_mensagens'),
        mensagens_reais: msgs,
        criado: String(c.get('created') || '').slice(0, 19),
        ultima: String(c.get('ultima_mensagem_em') || '').slice(0, 19),
      })
    }
    out.quantos = out.registros.length
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
