/// <reference path="../pb_data/types.d.ts" />
/**
 * REENVIA A APRESENTAÇÃO DO FÁBIO (11/11).
 *
 * A apresentação das 16:35 falhou com `dapi_http_5xx`. Aqui se reenfileira e se
 * mostra o resultado: passou (enviado + wamid) ou falhou de novo (e com qual
 * código). Isso separa instabilidade momentânea de bloqueio real.
 *
 * GET /backend/v1/check/reenvia-apres
 */
routerAdd(
  'GET',
  '/backend/v1/check/reenvia-apres',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, itens: [] }

    // as apresentações que falharam hoje
    var envs = []
    try {
      envs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_envios'),
        "motivo='apresentacao_vendedor' && estado='erro_definitivo' && created>='2026-11-11'",
        '',
        10,
        0,
      )
    } catch (e0) {
      return e.json(200, { ok: false, erro: String(e0).slice(0, 120) })
    }

    var n = 0
    for (const en of envs) {
      if (n >= 2) break
      try {
        en.set('estado', 'pendente')
        en.set('tentativas', 0)
        en.set('ultimo_erro', '')
        en.set(
          'dedupe_key',
          String(en.get('dedupe_key') || '') + '|re' + String(new Date().getTime()) + n,
        )
        app.save(en)
        n++
        out.itens.push({
          destino: String(en.get('destino_telefone') || '').slice(-6),
          quando_original: String(en.get('created') || '').slice(11, 19),
          reenfileirado: true,
        })
      } catch (e1) {
        out.itens.push({ erro: String(e1).slice(0, 100) })
      }
    }

    // também tenta um envio NOVO, direto, para ver a D-API agora
    var cx = null
    try {
      const cs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='vendedor' && ativo=true && apresentacao_ativa=true",
        '',
        1,
        0,
      )
      if (cs.length > 0) cx = cs[0]
    } catch (e2) {}

    if (cx) {
      const modelo = String(cx.get('modelo_apresentacao_vendedor') || '')
      var chave = ''
      try {
        const nc = String(cx.get('nome_segredo_chave') || '')
        if (nc !== '') chave = String($secrets.get(nc) || '')
      } catch (e3) {}

      var status = 0
      var resp = ''
      try {
        const r = $http.send({
          url: 'https://api.d-api.cloud/api/v1/messages/send/template',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: chave },
          body: JSON.stringify({
            sessionId: String(cx.get('session_id') || ''),
            to: '5541999601233',
            template: {
              name: modelo,
              language: 'pt_BR',
              bodyVariables: ['Anezia', 'Fabio'],
            },
          }),
          timeout: 22,
        })
        status = Number(r.statusCode || 0)
        var rb = r.body
        if (Array.isArray(rb)) resp = String.fromCharCode.apply(null, rb)
        else resp = String(rb)
      } catch (e4) {
        resp = 'excecao: ' + String(e4).slice(0, 80)
      }

      out.teste_direto = {
        numero: String(cx.get('nome_exibicao') || ''),
        modelo: modelo,
        status: status,
        resposta: resp.replace(/[0-9]{10,}/g, '***').slice(0, 220),
      }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
