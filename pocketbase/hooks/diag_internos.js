/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO PONTUAL (06/11) — por que o teste recusa número que ESTÁ na lista.
 *
 * A config devolve 8 internos, incluindo 5541999601233. Mas a rota de teste
 * recusa. Aqui se lê o campo `internos` do registro CRU, para ver se ele é
 * array de objetos, string JSON ou array de char-codes quando lido por
 * `findRecordsByFilter` (e não pela rota que a tela usa).
 *
 * GET /backend/v1/diag/internos-bruto
 */
routerAdd(
  'GET',
  '/backend/v1/diag/internos-bruto',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const vs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('atendimento_config'),
      '',
      '',
      200,
      0,
    )
    var cfg = null
    for (const v of vs) {
      if (!cfg || Number(v.get('versao') || 0) > Number(cfg.get('versao') || 0)) cfg = v
    }
    const out = {
      ok: true,
      versao: 0,
      tipo: '',
      amostra: '',
      ehArray: false,
      quantos: 0,
      numeros: [],
    }
    if (!cfg) return e.json(200, out)

    out.versao = Number(cfg.get('versao') || 0)
    const bruto = cfg.get('internos')
    out.tipo = typeof bruto
    out.ehArray = Array.isArray(bruto)
    out.amostra = JSON.stringify(bruto).slice(0, 200)
    out.quantos = Array.isArray(bruto) ? bruto.length : 0

    // tenta os caminhos possíveis
    var lista = []
    try {
      if (Array.isArray(bruto) && bruto.length > 0 && typeof bruto[0] === 'number') {
        lista = JSON.parse(String.fromCharCode.apply(null, bruto))
      } else if (typeof bruto === 'string') {
        lista = JSON.parse(bruto)
      } else {
        lista = bruto || []
      }
    } catch (e0) {}
    if (Array.isArray(lista)) {
      for (const i of lista) out.numeros.push(String(i.numero || i || ''))
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
