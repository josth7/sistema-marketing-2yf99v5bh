/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA CA-3-86 — pausa automática por recusa (06/11).
 *
 * **A regra:** 10% ou mais de recusa nas últimas 50 mensagens da campanha
 * pausa sozinha — é o que impede o número de ser bloqueado de vez.
 *
 * **Como provar sem mandar mensagem:** cria uma campanha de teste com 50
 * envios marcados (6 como recusa = 12%), chama o resultado e confere que a
 * campanha foi pausada com o motivo certo. Depois limpa tudo.
 *
 * GET /backend/v1/diag/prova-pausa
 */
routerAdd(
  'GET',
  '/backend/v1/diag/prova-pausa',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { passos: [], ok: false }
    const NOME = 'Prova Pausa Auto'

    // limpa resto de execução anterior
    try {
      const colC = app.findCollectionByNameOrId('campanhas')
      const velhas = app.findRecordsByFilter(colC, "nome='" + NOME + "'", '', 10, 0)
      for (const v of velhas) {
        try {
          app.delete(v)
        } catch (a) {}
      }
    } catch (e0) {}
    try {
      const colE = app.findCollectionByNameOrId('whatsapp_envios')
      const es = app.findRecordsByFilter(colE, "dedupe_key ~ 'prova-pausa'", '', 500, 0)
      for (const en of es) {
        try {
          app.delete(en)
        } catch (b) {}
      }
    } catch (e1) {}

    // ---------- 1. campanha de teste em andamento ----------
    var central = null
    try {
      const cxs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='central' && ativo=true",
        '',
        5,
        0,
      )
      if (cxs.length > 0) central = cxs[0]
    } catch (e2) {}
    if (!central) {
      out.erro = 'sem central'
      return e.json(200, out)
    }

    var camp = null
    try {
      const colC = app.findCollectionByNameOrId('campanhas')
      const c = new Record(colC)
      c.set('nome', NOME)
      c.set('conexao', central.id)
      c.set('modelo_nome', 'prova')
      c.set('estado', 'em_andamento')
      c.set('ritmo_hora', 20)
      c.set('teto_dia', 200)
      c.set('fixture', false)
      app.save(c)
      camp = c
      out.passos.push({ passo: '1. campanha de teste', ok: true, detalhe: c.id })
    } catch (e3) {
      out.erro = 'criar campanha: ' + String(e3).slice(0, 140)
      return e.json(200, out)
    }

    // ---------- 2. 50 envios, 6 com recusa (12%) ----------
    try {
      const colE = app.findCollectionByNameOrId('whatsapp_envios')
      for (var i = 0; i < 50; i++) {
        const en = new Record(colE)
        en.set('conexao', central.id)
        en.set('destino_telefone', '555199000' + String(1000 + i))
        en.set('motivo', 'campanha')
        en.set('modo', 'modelo')
        en.set('modelo_nome', 'prova')
        en.set('texto', '')
        en.set('legenda', '')
        en.set('autor_user', '')
        en.set('criado_por', '')
        if (i < 6) {
          // 6 recusas de qualidade da Meta (131049)
          en.set('estado', 'erro_definitivo')
          en.set('ultimo_erro', 'meta: 131049 recusa de qualidade')
        } else {
          en.set('estado', 'enviado')
          en.set('ultimo_erro', '')
        }
        en.set('tentativas', 1)
        en.set('fixture', false)
        en.set('dedupe_key', 'prova-pausa-' + String(i))
        app.save(en)
      }
      out.passos.push({
        passo: '2. 50 envios com 6 recusas (12%)',
        ok: true,
        detalhe: '12% >= 10%',
      })
    } catch (e4) {
      out.passos.push({ passo: '2. envios', ok: false, detalhe: String(e4).slice(0, 120) })
    }

    // ---------- 3. chama o resultado e confere a pausa ----------
    const auth = String(e.request.header.get('Authorization') || '')
    var res = null
    try {
      const r = $http.send({
        url:
          'https://sistema-marketing-1f51e.shrd00.internal.goskip.dev/backend/v1/campanhas/' +
          camp.id +
          '/resultado',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: '{}',
        timeout: 40,
      })
      var cb = r.body
      if (Array.isArray(cb)) cb = String.fromCharCode.apply(null, cb)
      res = JSON.parse(String(cb))
    } catch (e5) {
      out.passos.push({
        passo: '3. chamar resultado',
        ok: false,
        detalhe: String(e5).slice(0, 120),
      })
    }

    if (res) {
      out.passos.push({
        passo: '3. pausou sozinha em 12% de recusa',
        ok: res.pausou_agora === true && res.estado === 'pausada',
        detalhe: 'estado=' + String(res.estado) + ' pausou=' + String(res.pausou_agora),
      })
      out.passos.push({
        passo: '4. mostra as recusas com código',
        ok: Array.isArray(res.recusas) && res.recusas.length > 0,
        detalhe: JSON.stringify(res.recusas),
      })
      out.passos.push({
        passo: '5. conta os enviados',
        ok: Number(res.enviados) === 44,
        detalhe: 'enviados=' + String(res.enviados),
      })
    }

    // ---------- 6. limpeza ----------
    try {
      const colE = app.findCollectionByNameOrId('whatsapp_envios')
      const es = app.findRecordsByFilter(colE, "dedupe_key ~ 'prova-pausa'", '', 500, 0)
      for (const en of es) {
        try {
          app.delete(en)
        } catch (c) {}
      }
      app.delete(camp)
      out.passos.push({ passo: '6. limpeza', ok: true, detalhe: 'campanha e envios removidos' })
    } catch (e6) {
      out.passos.push({ passo: '6. limpeza', ok: false, detalhe: String(e6).slice(0, 100) })
    }

    var tudo = true
    for (const p of out.passos) if (!p.ok) tudo = false
    out.ok = tudo
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
