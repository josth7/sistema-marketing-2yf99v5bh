/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/prep-final',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const ex = String(e.request.url.query().get('executar') || '') === '1'
    const out = { ok: true, executar: ex, candidatas: [], preparada: null }
    var central = null
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='central' && ativo=true && fixture=false",
      '',
      1,
      0,
    ))
      central = c
    if (!central) return e.json(200, { ok: false, erro: 'sem central' })
    const emp = String(central.get('empresa') || '')
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
    // candidatas: conversas da central com POUCAS mensagens (teste limpo)
    const cvs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conversas'),
      "conexao='" + central.id + "'",
      '',
      2000,
      0,
    )
    for (const c of cvs) {
      const msgs = Number(c.get('total_mensagens') || 0)
      if (msgs > 2) continue
      out.candidatas.push({
        tel: String(c.get('contato_telefone') || '').slice(-6),
        estado: String(c.get('estado') || ''),
        msgs: msgs,
        etapa: String(c.get('etapa_atual') || ''),
        id: c.id.slice(0, 10),
        fixture: String(c.get('fixture')),
      })
    }
    if (ex && out.candidatas.length > 0) {
      // prepara a PRIMEIRA: triagem, etapa vazia, IA zerada
      const tel = out.candidatas[0].tel
      for (const c of cvs) {
        if (String(c.get('contato_telefone') || '').slice(-6) !== tel) continue
        try {
          c.set('estado', 'triagem')
          c.set('etapa_atual', '')
          c.set('pausada_motivo', '')
          c.set('pausada_em', '')
          try {
            c.set('ultima_resposta_ia_em', '')
          } catch (x) {}
          c.set('ultimo_autor', 'cliente')
          app.save(c)
          out.preparada = {
            tel: tel,
            estado: 'triagem',
            etapa: 'limpa',
            msgs: Number(c.get('total_mensagens') || 0),
          }
        } catch (e1) {
          out.erro = String(e1).slice(0, 120)
        }
      }
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
