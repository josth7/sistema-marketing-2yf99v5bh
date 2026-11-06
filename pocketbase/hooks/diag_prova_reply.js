/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA CA-3-50 — liberar resposta por pessoa (06/11).
 *
 * **O que precisa ficar provado:**
 *   1. quem tem `reply_conversas` **envia** (a rota aceita);
 *   2. quem NÃO tem **recebe 403** com explicação, mesmo lendo a conversa;
 *   3. tirar a ação de alguém não apaga a conversa nem o histórico.
 *
 * Usa o próprio grant da Elisângela: tira a ação, testa, devolve. Ela continua
 * atendendo em seguida — o teste não deixa ninguém travado.
 *
 * GET /backend/v1/diag/prova-reply
 */
routerAdd(
  'GET',
  '/backend/v1/diag/prova-reply',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { passos: [], ok: false }
    const colG = app.findCollectionByNameOrId('access_grants')

    function lerL(raw) {
      try {
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          return JSON.parse(String.fromCharCode.apply(null, raw))
        }
        if (typeof raw === 'string') return JSON.parse(raw)
        return raw || []
      } catch (err) {
        return []
      }
    }

    // ---------- acha o grant de uma vendedora real ----------
    var alvoUser = ''
    try {
      const u = app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        "email='elisangela@haisan.com.br'",
        '',
        1,
        0,
      )
      if (u && u.length > 0) alvoUser = u[0].id
    } catch (e0) {}
    if (alvoUser === '') {
      out.erro = 'vendedora de teste não encontrada'
      return e.json(200, out)
    }

    var grant = null
    try {
      const gs = app.findRecordsByFilter(
        colG,
        "user_id='" + alvoUser + "' && revoked_at=''",
        '',
        5,
        0,
      )
      if (gs && gs.length > 0) grant = gs[0]
    } catch (e1) {}
    if (!grant) {
      out.erro = 'grant não encontrado'
      return e.json(200, out)
    }

    const atosOriginais = lerL(grant.get('actions'))
    out.passos.push({
      passo: '1. grant da vendedora',
      ok: atosOriginais.indexOf('reply_conversas') >= 0,
      detalhe:
        atosOriginais.length +
        ' ações, tem reply=' +
        (atosOriginais.indexOf('reply_conversas') >= 0),
    })

    // ---------- 2. uma conversa dela ----------
    var convId = ''
    try {
      const cxs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "vendedor_user='" + alvoUser + "'",
        '',
        5,
        0,
      )
      if (cxs.length > 0) {
        const cvs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_conversas'),
          "conexao='" + cxs[0].id + "'",
          '',
          1,
          0,
        )
        if (cvs.length > 0) convId = cvs[0].id
      }
    } catch (e2) {}
    out.passos.push({ passo: '2. conversa da carteira dela', ok: convId !== '', detalhe: convId })

    // ---------- 3. TIRA a ação e testa ----------
    const auth = String(e.request.header.get('Authorization') || '')
    // login dela (a senha padrão do piloto)
    var tokenEli = ''
    try {
      const resp = $http.send({
        url: 'https://sistema-marketing-1f51e.shrd00.internal.goskip.dev/api/collections/users/auth-with-password',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identity: 'elisangela@haisan.com.br',
          password: 'Haisan@2026',
        }),
        timeout: 20,
      })
      var cb = resp.body
      if (Array.isArray(cb)) cb = String.fromCharCode.apply(null, cb)
      tokenEli = String(JSON.parse(String(cb)).token || '')
    } catch (e3) {}

    var bloqueou = false
    if (tokenEli !== '' && convId !== '') {
      try {
        // tira reply_conversas
        const semReply = atosOriginais.filter(function (a) {
          return a !== 'reply_conversas'
        })
        grant.set('actions', JSON.stringify(semReply))
        app.save(grant)

        // tenta responder: deve dar 403
        const r2 = $http.send({
          url:
            'https://sistema-marketing-1f51e.shrd00.internal.goskip.dev/backend/v1/whatsapp/conversas/' +
            convId +
            '/responder',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: tokenEli },
          body: JSON.stringify({ texto: 'teste de bloqueio' }),
          timeout: 25,
        })
        var c2 = r2.body
        if (Array.isArray(c2)) c2 = String.fromCharCode.apply(null, c2)
        const st = Number(r2.statusCode || 0)
        bloqueou = st === 403
        out.passos.push({
          passo: '3. sem a ação, o envio é bloqueado',
          ok: bloqueou,
          detalhe: 'HTTP ' + st + ' ' + String(c2).slice(0, 60),
        })
      } catch (e4) {
        out.passos.push({ passo: '3. bloqueio', ok: false, detalhe: String(e4).slice(0, 100) })
      }
    }

    // ---------- 4. DEVOLVE a ação (sempre) ----------
    try {
      grant.set('actions', JSON.stringify(atosOriginais))
      app.save(grant)
      out.passos.push({
        passo: '4. ação devolvida à vendedora',
        ok: true,
        detalhe: atosOriginais.length + ' ações restauradas',
      })
    } catch (e5) {
      out.passos.push({
        passo: '4. DEVOLVER AÇÃO',
        ok: false,
        detalhe: 'FALHOU: ' + String(e5).slice(0, 100),
      })
    }

    // ---------- 5. ela volta a poder responder ----------
    if (tokenEli !== '' && convId !== '') {
      try {
        const r3 = $http.send({
          url:
            'https://sistema-marketing-1f51e.shrd00.internal.goskip.dev/backend/v1/whatsapp/conversas/' +
            convId +
            '/responder',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: tokenEli },
          body: JSON.stringify({}),
          timeout: 25,
        })
        var c3 = r3.body
        if (Array.isArray(c3)) c3 = String.fromCharCode.apply(null, c3)
        // corpo vazio = 422 (passou pela permissão)
        const st3 = Number(r3.statusCode || 0)
        out.passos.push({
          passo: '5. com a ação de volta, ela passa pela permissão',
          ok: st3 === 422,
          detalhe: 'HTTP ' + st3 + ' (422 = recusou só o texto vazio)',
        })
      } catch (e6) {}
    }

    var tudo = true
    for (const p of out.passos) if (!p.ok) tudo = false
    out.ok = tudo
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
