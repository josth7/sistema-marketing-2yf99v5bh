/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/robo-parou',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true }
    // config lida pela EMPRESA DA CENTRAL (mesmo criterio do cron)
    const cs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='central' && ativo=true && fixture=false",
      '',
      1,
      0,
    )
    if (cs.length > 0) {
      const emp = String(cs[0].get('empresa') || '')
      const vs = app.findRecordsByFilter(
        'atendimento_config',
        emp !== '' ? "empresa='" + emp + "'" : '',
        '',
        200,
        0,
      )
      var cfg = null
      for (const v of vs) {
        if (!cfg || Number(v.get('versao') || 0) > Number(cfg.get('versao') || 0)) cfg = v
      }
      out.config = {
        empresa: emp.slice(0, 8),
        versao: cfg ? Number(cfg.get('versao')) : 0,
        ligado: cfg ? cfg.get('ligado') === true : false,
        janela: cfg ? Number(cfg.get('janela_min') || 0) : 0,
      }
    }
    // conversas da central em TRIAGEM agora
    if (cs.length > 0) {
      const tri = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "conexao='" + cs[0].id + "' && estado='triagem'",
        '',
        500,
        0,
      )
      out.triagem_central = tri.length
      const lst = []
      for (const c of tri)
        lst.push({
          tel: String(c.get('contato_telefone') || '').slice(-6),
          ult: String(c.get('ultima_mensagem_em') || '').slice(0, 19),
          ia: String(c.get('ultima_resposta_ia_em') || '').slice(0, 19),
          autor: String(c.get('ultimo_autor') || ''),
        })
      out.conversas = lst.slice(0, 6)
    }
    // o cron rodou?
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
