/// <reference path="../pb_data/types.d.ts" />
/**
 * GET /backend/v1/analises/canal-estado — saúde do canal Maestro↔sistema
 * para a tela Saúde (card 6b8c8de9, SPEC-3-001).
 *
 * Por que este arquivo existe (04/11): a rota foi criada em 20/10 dentro de
 * analises.js e se perdeu em 21/10, quando analises.js foi dividido em
 * analises_canal.js e analises_fixtures.js — só a versão de teste
 * (/backend/v1/fixtures/canal-estado) sobreviveu. A tela Saúde chamava a rota
 * e recebia 404. Uma rota por arquivo, como pede o guia do Skip.
 *
 * Só leitura, exige login. Nunca devolve o valor de segredo.
 */
routerAdd(
  'GET',
  '/backend/v1/analises/canal-estado',
  (e) => {
    // ---------- empresa ativa (CA-3-88) ----------
    // Lê os grants AQUI, no escopo da rota: `const meus` de dentro de um try
    // não existe fora dele (lança, o catch engole, o 403 não dispara).
    var empresaAtiva = ''
    try {
      var pedidaW = String(e.request.header.get('X-Empresa') || '')
      var gsW = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      var empGrantW = []
      var ehDonoW = false
      for (const gW of gsW) {
        var empGW = ''
        try {
          empGW = String(gW.get('empresa') || '')
        } catch (eGW) {}
        if (empGW !== '' && empGrantW.indexOf(empGW) < 0) empGrantW.push(empGW)
        var saW = []
        try {
          var rawW = gW.get('scope_accounts')
          saW =
            Array.isArray(rawW) && rawW.length > 0 && typeof rawW[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawW))
              : typeof rawW === 'string'
                ? JSON.parse(rawW)
                : rawW || []
        } catch (eSAW) {}
        if (Array.isArray(saW) && saW.indexOf('*') >= 0) ehDonoW = true
      }
      if (pedidaW !== '') {
        if (!ehDonoW && empGrantW.indexOf(pedidaW) < 0) {
          return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
        }
        empresaAtiva = pedidaW
      } else if (empGrantW.length > 0) {
        empresaAtiva = empGrantW[0]
      } else {
        const esW = $app.findRecordsByFilter('empresas', 'ativa=true', '', 1, 0)
        if (esW.length > 0) empresaAtiva = esW[0].id
      }
    } catch (eEmpW) {}

    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    var recs = []
    try {
      const colC = $app.findCollectionByNameOrId('canal_estado')
      recs = $app.findRecordsByFilter(colC, '', '', 1, 0)
    } catch (eC) {
      return e.json(200, { ok: true, canal: null })
    }
    if (!recs || recs.length === 0) return e.json(200, { ok: true, canal: null })
    const c = recs[0]
    return e.json(200, {
      ok: true,
      canal: {
        segredo_configurado: c.get('segredo_configurado') === true,
        ultimo_consumo_em: c.get('ultimo_consumo_em') || null,
        ciclos_sem_consumo: Number(c.get('ciclos_sem_consumo') || 0),
        recusas_401_total: Number(c.get('recusas_401_total') || 0),
        recusas_401_ultimas_24h: Number(c.get('recusas_401_ultimas_24h') || 0),
        ultimo_motivo: c.get('ultimo_motivo') || null,
        atualizado_em: c.get('atualizado_em') || null,
      },
    })
  },
  $apis.requireAuth(),
)
