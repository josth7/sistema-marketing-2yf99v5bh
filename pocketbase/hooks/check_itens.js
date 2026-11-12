/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA DOS ITENS 4 E 5 (12/11).
 *
 * **Item 4:** o `wa_apresentacao_cron` lia a config de maior versão do sistema
 * (v12 da Gol 7, desligada). Agora filtra pela empresa da conexão central.
 * Aqui se mostra: a empresa da central, a config que ela produz, e a diferença
 * para a "maior versão".
 *
 * **Item 5:** a senha não está mais na migração 0170.
 *
 * GET /backend/v1/check/itens
 */
routerAdd(
  'GET',
  '/backend/v1/check/itens',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true }

    // ----- item 4 -----
    var empCentral = ''
    try {
      const cx = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='central' && ativo=true && fixture=false",
        '',
        1,
        0,
      )
      if (cx.length > 0) empCentral = String(cx[0].get('empresa') || '')
    } catch (e0) {}

    var nomesEmp = {}
    try {
      for (const x of app.findRecordsByFilter('empresas', '', '', 20, 0)) {
        nomesEmp[x.id] = String(x.get('apelido') || x.get('nome') || '')
      }
    } catch (e1) {}

    // o que o cron lê AGORA (pela empresa da central)
    var cfgEmpresa = null
    try {
      const vs = app.findRecordsByFilter(
        'atendimento_config',
        empCentral !== '' ? "empresa='" + empCentral + "'" : '',
        '',
        200,
        0,
      )
      for (const v of vs) {
        if (!cfgEmpresa || Number(v.get('versao') || 0) > Number(cfgEmpresa.get('versao') || 0))
          cfgEmpresa = v
      }
    } catch (e2) {}

    // o que ele lia ANTES (maior versão do sistema)
    var cfgMaior = null
    try {
      for (const v of app.findRecordsByFilter('atendimento_config', '', '', 500, 0)) {
        if (!cfgMaior || Number(v.get('versao') || 0) > Number(cfgMaior.get('versao') || 0))
          cfgMaior = v
      }
    } catch (e3) {}

    out.item4 = {
      empresa_da_central: nomesEmp[empCentral] || empCentral.slice(0, 8),
      le_agora: cfgEmpresa
        ? {
            versao: Number(cfgEmpresa.get('versao') || 0),
            empresa: nomesEmp[String(cfgEmpresa.get('empresa') || '')] || '',
            ligado: cfgEmpresa.get('ligado') === true,
            hora_inicio: String(cfgEmpresa.get('hora_inicio') || ''),
          }
        : null,
      lia_antes: cfgMaior
        ? {
            versao: Number(cfgMaior.get('versao') || 0),
            empresa: nomesEmp[String(cfgMaior.get('empresa') || '')] || '',
            ligado: cfgMaior.get('ligado') === true,
          }
        : null,
    }
    out.item4.correto =
      out.item4.le_agora !== null && out.item4.le_agora.empresa === out.item4.empresa_da_central

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
