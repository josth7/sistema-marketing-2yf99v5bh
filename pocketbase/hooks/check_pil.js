/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/piloto-estado',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, agora: new Date().toISOString().slice(0, 19) }
    // 1. o robo esta ligado?
    const cs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='central' && ativo=true && fixture=false",
      '',
      1,
      0,
    )
    if (cs.length > 0) {
      const emp = String(cs[0].get('empresa') || '')
      var cfg = null
      for (const v of app.findRecordsByFilter(
        'atendimento_config',
        "empresa='" + emp + "'",
        '',
        200,
        0,
      ))
        if (!cfg || Number(v.get('versao') || 0) > Number(cfg.get('versao') || 0)) cfg = v
      out.robo = cfg
        ? { versao: Number(cfg.get('versao')), ligado: cfg.get('ligado') === true }
        : null
    }
    // 2. quantas transferencias existem no total?
    try {
      out.transferencias = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_transferencias'),
        '',
        '',
        500,
        0,
      ).length
    } catch (e1) {}
    // 3. conversas em triagem na central
    if (cs.length > 0) {
      out.triagem = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "conexao='" + cs[0].id + "' && estado='triagem'",
        '',
        500,
        0,
      ).length
    }
    // 4. apresentacoes: entregues x total (desde 12/11)
    var ap = 0,
      ok2 = 0
    try {
      const envs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_envios'),
        "motivo='apresentacao_vendedor' && created>='2026-11-12 18:00'",
        '',
        100,
        0,
      )
      ap = envs.length
      for (const x of envs) {
        if (String(x.get('estado')) === 'enviado') ok2++
      }
    } catch (e2) {}
    out.apresentacoes = { total: ap, enviadas: ok2 }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
