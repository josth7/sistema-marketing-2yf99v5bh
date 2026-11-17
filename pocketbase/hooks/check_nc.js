/// <reference path="../pb_data/types.d.ts" />
/**
 * NOME DO CONSULTOR (17/11).
 *
 * O `rodrigo@adapta.org` é o consultor do dono — acesso legítimo, confirmado.
 * Mas está SEM NOME, então o sistema mostra o e-mail dele em qualquer lugar que
 * use `name || email`. Aqui se dá um nome legível, sem mexer no acesso.
 *
 * Sem `?executar=1` é só leitura.
 *
 * GET /backend/v1/check/nome-consultor?executar=1
 */
routerAdd(
  'GET',
  '/backend/v1/check/nome-consultor',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const executar = String(e.request.url.query().get('executar') || '') === '1'
    const out = { ok: true, executar: executar, antes: null, depois: null }

    var u = null
    try {
      const us = app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        "email='rodrigo@adapta.org'",
        '',
        1,
        0,
      )
      if (us.length > 0) u = us[0]
    } catch (e0) {}
    if (!u) return e.json(200, { ok: false, erro: 'usuario nao encontrado' })

    out.antes = {
      nome: String(u.get('name') || '(VAZIO)'),
      email: String(u.get('email') || ''),
    }

    if (executar) {
      try {
        // "Rodrigo (consultor)" — identifica a pessoa e o papel, sem ambiguidade
        // com os vendedores da Haisan.
        u.set('name', 'Rodrigo (consultor)')
        app.save(u)
        const conf = app.findRecordById('users', u.id)
        out.depois = { nome: String(conf.get('name') || '(VAZIO)') }
      } catch (e1) {
        out.erro = String(e1).slice(0, 160)
      }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
