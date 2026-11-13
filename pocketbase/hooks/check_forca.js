/// <reference path="../pb_data/types.d.ts" />
// Roda a decisão do roteiro para a conversa travada e MOSTRA a decisão
routerAdd(
  'GET',
  '/backend/v1/check/forca',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true }
    const cvs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conversas'),
      "contato_telefone~'9036170'",
      '',
      10,
      0,
    )
    const centrais = {}
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='central' && ativo=true && fixture=false",
      '',
      5,
      0,
    ))
      centrais[c.id] = 1
    var alvo = null
    for (const c of cvs) if (centrais[String(c.get('conexao') || '')]) alvo = c
    if (!alvo) return e.json(200, { ok: false })
    // a ultima mensagem e as condicoes que o cron aplica, uma por uma
    const ms = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "conexao='" + String(alvo.get('conexao')) + "' && contato_telefone~'9036170'",
      '',
      80,
      0,
    )
    var ult = null
    for (const m of ms) {
      if (!ult || String(m.get('created') || '') > String(ult.get('created') || '')) ult = m
    }
    out.ultima = {
      dir: String(ult.get('direcao') || ''),
      autor: String(ult.get('autor') || ''),
      txt: String(ult.get('texto') || '').slice(0, 20),
    }
    out.checks = []
    // check 1: a ultima e do cliente e nao da ia?
    const dir = String(ult.get('direcao') || '')
    out.checks.push({
      check: 'ultima msg e entrada (cliente)?',
      passa: dir === 'entrada',
      valor: dir,
    })
    // check 2: estado triagem
    out.checks.push({
      check: 'estado=triagem?',
      passa: String(alvo.get('estado')) === 'triagem',
      valor: String(alvo.get('estado')),
    })
    // check 3: idempotencia
    const ultimaIa = String(alvo.get('ultima_resposta_ia_em') || '')
    const criadaMsg = String(ult.get('created') || '')
    out.checks.push({
      check: 'nao respondeu essa msg?',
      passa: !(ultimaIa !== '' && criadaMsg !== '' && ultimaIa >= criadaMsg),
      valor: ultimaIa + ' vs ' + criadaMsg,
    })
    // check 4: janela (720 min)
    var cfg = null
    const emp = (function () {
      const cs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='central' && ativo=true && fixture=false",
        '',
        1,
        0,
      )
      return cs.length ? String(cs[0].get('empresa') || '') : ''
    })()
    for (const v of app.findRecordsByFilter(
      'atendimento_config',
      "empresa='" + emp + "'",
      '',
      200,
      0,
    ))
      if (!cfg || Number(v.get('versao') || 0) > Number(cfg.get('versao') || 0)) cfg = v
    const janela = cfg ? Number(cfg.get('janela_min') || 720) : 720
    const quando = new Date(criadaMsg.replace(' ', 'T')).getTime()
    const min = (new Date().getTime() - quando) / 60000
    out.checks.push({
      check: 'dentro da janela (' + janela + 'min)?',
      passa: min <= janela,
      valor: Math.round(min) + ' min',
    })
    // check 5: horario
    if (cfg && cfg.get('usar_horario') === true) {
      const br = new Date(new Date().getTime() - 3 * 3600000)
      const hh = ('0' + br.getUTCHours()).slice(-2) + ':' + ('0' + br.getUTCMinutes()).slice(-2)
      const ini = String(cfg.get('hora_inicio') || '00:00'),
        fim = String(cfg.get('hora_fim') || '23:59')
      out.checks.push({
        check: 'dentro do horario?',
        passa: hh >= ini && hh <= fim,
        valor: hh + ' (painel ' + ini + '-' + fim + ')',
      })
    }
    out.passa_tudo = out.checks.every(function (c) {
      return c.passa
    })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
