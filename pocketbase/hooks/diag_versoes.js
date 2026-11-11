/// <reference path="../pb_data/types.d.ts" />
/**
 * O QUE A ANÉZIA AJUSTOU (11/11) — CA-3-17 / CL-016.
 *
 * O dono disse: "Anezia já ajustou no sistema o que ela precisava, manter".
 * Aqui se lista TODAS as versões da config com autor e data, para registrar o
 * aceite dela com o estado real que está valendo.
 *
 * GET /backend/v1/empresas/versoes-config
 */
routerAdd(
  'GET',
  '/backend/v1/empresas/versoes-config',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, versoes: [], ativa: null }

    const emps = {}
    try {
      for (const x of app.findRecordsByFilter('empresas', '', '', 20, 0)) {
        emps[x.id] = String(x.get('apelido') || x.get('nome') || '')
      }
    } catch (e0) {}

    var cfgs = []
    try {
      cfgs = app.findRecordsByFilter('atendimento_config', '', '', 500, 0)
    } catch (e1) {
      return e.json(200, { ok: false, erro: String(e1).slice(0, 120) })
    }

    cfgs.sort(function (a, b) {
      return Number(b.get('versao') || 0) - Number(a.get('versao') || 0)
    })

    for (const c of cfgs) {
      const v = Number(c.get('versao') || 0)
      var nTextos = 0
      var nFaq = 0
      var nPalavras = 0
      try {
        nTextos = Object.keys(JSON.parse(String(c.get('textos') || '{}'))).length
      } catch (e2) {}
      try {
        const f = JSON.parse(String(c.get('faq') || '[]'))
        nFaq = Array.isArray(f) ? f.length : 0
      } catch (e3) {}
      try {
        nPalavras = Object.keys(JSON.parse(String(c.get('palavras') || '{}'))).length
      } catch (e4) {}

      out.versoes.push({
        versao: v,
        empresa: emps[String(c.get('empresa') || '')] || '(sem empresa)',
        ligado: c.get('ligado') === true,
        hora_inicio: String(c.get('hora_inicio') || ''),
        hora_fim: String(c.get('hora_fim') || ''),
        textos: nTextos,
        faq: nFaq,
        palavras: nPalavras,
        autor: String(c.get('autor_nome') || c.get('autor_id') || '(nao registrado)'),
        criado: String(c.get('created') || '').slice(0, 16),
      })
    }

    // a ativa = maior versão da Haisan
    for (const v of out.versoes) {
      if (v.empresa !== 'Gol 7' && v.empresa !== 'TESTE') {
        out.ativa = v
        break
      }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
