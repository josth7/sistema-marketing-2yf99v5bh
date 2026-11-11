/// <reference path="../pb_data/types.d.ts" />
/**
 * ESTADO DA GOL 7 (11/11) — CA-3-92.
 *
 * Confere: empresa criada e ativa, config-modelo existente e SEM dado da
 * Haisan (textos/FAQ/palavras vazios), Anezia dona das duas, Sabrina só na
 * Gol 7.
 *
 * GET /backend/v1/empresas/gol7-estado
 */
routerAdd(
  'GET',
  '/backend/v1/empresas/gol7-estado',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, empresas: [], pessoas: [] }

    var idGol7 = ''
    try {
      for (const x of app.findRecordsByFilter('empresas', '', '', 20, 0)) {
        const nome = String(x.get('apelido') || x.get('nome') || '')
        out.empresas.push({ nome: nome, ativa: x.get('ativa') === true, id: x.id.slice(0, 8) })
        if (nome.indexOf('Gol') >= 0) idGol7 = x.id
      }
    } catch (e0) {}

    // config-modelo da Gol 7
    if (idGol7 !== '') {
      try {
        const cfgs = app.findRecordsByFilter(
          'atendimento_config',
          "empresa='" + idGol7 + "'",
          '',
          5,
          0,
        )
        if (cfgs.length > 0) {
          const c = cfgs[0]
          var nTextos = 0
          var nFaq = 0
          var nPalavras = 0
          try {
            const t = JSON.parse(String(c.get('textos') || '{}'))
            nTextos = Object.keys(t).length
          } catch (eT) {}
          try {
            const f = JSON.parse(String(c.get('faq') || '[]'))
            nFaq = Array.isArray(f) ? f.length : 0
          } catch (eF) {}
          try {
            const p = JSON.parse(String(c.get('palavras') || '{}'))
            nPalavras = Object.keys(p).length
          } catch (eP) {}
          out.config_gol7 = {
            versao: Number(c.get('versao') || 0),
            ligado: c.get('ligado') === true,
            textos: nTextos,
            faq: nFaq,
            palavras: nPalavras,
            sem_dado_da_haisan: nTextos === 0 && nFaq === 0 && nPalavras === 0,
          }
        } else {
          out.config_gol7 = { erro: 'nenhuma config para a Gol 7' }
        }
      } catch (e1) {}
    }

    // quem tem grant na Gol 7
    if (idGol7 !== '') {
      try {
        const gs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('access_grants'),
          "empresa='" + idGol7 + "' && revoked_at=''",
          '',
          50,
          0,
        )
        for (const g of gs) {
          var nome = ''
          try {
            nome = String(app.findRecordById('users', String(g.get('user_id'))).get('name') || '')
          } catch (eU) {}
          out.pessoas.push({ nome: nome.slice(0, 24), papel: String(g.get('role') || '') })
        }
      } catch (e2) {}
    }

    // os donos (escopo `*`) veem as duas
    try {
      const colG = app.findCollectionByNameOrId('access_grants')
      const gsD = app.findRecordsByFilter(colG, "revoked_at=''", '', 200, 0)
      out.donos = []
      for (const g of gsD) {
        var scD = []
        try {
          const rawD = g.get('scope_accounts')
          scD =
            Array.isArray(rawD) && rawD.length > 0 && typeof rawD[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawD))
              : typeof rawD === 'string'
                ? JSON.parse(rawD)
                : rawD || []
        } catch (eD) {}
        if (Array.isArray(scD) && scD.indexOf('*') >= 0) {
          var nm = ''
          try {
            nm = String(app.findRecordById('users', String(g.get('user_id'))).get('email') || '')
          } catch (eN) {}
          if (out.donos.indexOf(nm) < 0) out.donos.push(nm)
        }
      }
    } catch (e3) {}

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
