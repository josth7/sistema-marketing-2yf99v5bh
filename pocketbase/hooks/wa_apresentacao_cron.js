/// <reference path="../pb_data/types.d.ts" />
/**
 * APRESENTAÇÃO AO CLIENTE PELO NÚMERO DO VENDEDOR — RN-138b / CA-3-68 / CA-3-79 (06/11).
 *
 * Como funciona (decisão do dono, 06/11):
 *   1. O cliente fala com a central e recebe a frase de transferência com o
 *      link do WhatsApp do vendedor (robô: `ia_resposta`; ponto único:
 *      `aviso_cliente`). O vendedor NÃO recebe aviso nenhum.
 *   2. Se em 15 minutos não houver nenhuma mensagem entre o cliente e o número
 *      do vendedor (nem o cliente chamou, nem o vendedor chamou), o NÚMERO DO
 *      VENDEDOR manda ao CLIENTE o modelo aprovado de apresentação
 *      (`modelo_apresentacao_vendedor` da conexão): {{1}} primeiro nome do
 *      cliente (vazio → "tudo bem"), {{2}} nome público do vendedor.
 *      A conversa fica no celular do vendedor (coexistência) e ele continua.
 *
 * Regras:
 *   - só para conexões com `apresentacao_ativa = true` e modelo preenchido;
 *   - uma vez por lead (`dedupe_key = apresentacao|<lead>`);
 *   - no máximo 20 por hora por número;
 *   - só olha frases de 15 min a 2 h atrás (não dispara para fila antiga
 *     quando a apresentação é ligada);
 *   - quem envia é a fila (`whatsapp_envios_fila.js`), pela chave do número
 *     do vendedor, na rota de modelo da D-API;
 *   - teste (fixture) só casa com conexão de teste, e real só com real.
 *
 * Até a v0.0.617 a "apresentação" saía na hora, do número do vendedor para o
 * PRÓPRIO vendedor, com o texto de aviso de lead — corrigido aqui e em
 * `whatsapp_transferencias.js`.
 *
 * JSVM: lógica INLINE no callback; datas do PocketBase vêm como
 * "AAAA-MM-DD HH:MM:SS.sssZ".
 */
cronAdd('wa_apresentacao_15min', '*/2 * * * *', () => {
  const MINUTOS = 15
  const JANELA_MAX_MIN = 120
  const TETO_HORA = 20
  const agora = Date.now()

  // ---------- RN-195 (10/11): apresentação só no horário comercial ----------
  // O Rodrigo reclamou: a apresentação saía de madrugada. Aqui se confere o
  // horário do painel; fora dele, o cron NÃO enfileira — o envio fica para a
  // abertura do próximo período útil (a fila também bloqueia, em redundância).
  // O SERVIDOR ESTÁ EM UTC (confirmado 10/11): Brasília = UTC-3.
  var dentroHorarioAp = true
  var quandoAp = 'amanhã'
  var iniAp = '08:00'
  try {
    // ITEM 4 (12/11): esta rotina lia a config de MAIOR VERSÃO DO SISTEMA —
    // o mesmo defeito que desligou o robô em 11/11, quando a Gol 7 nasceu
    // (v12, ligado=false). Agora filtra pela empresa da CONEXÃO CENTRAL, como
    // já está no wa_roteiro_cron.
    var empAp = ''
    try {
      const cxAp = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='central' && ativo=true && fixture=false",
        '',
        1,
        0,
      )
      if (cxAp.length > 0) empAp = String(cxAp[0].get('empresa') || '')
    } catch (eCxAp) {}
    const cfgAp = $app.findRecordsByFilter(
      'atendimento_config',
      empAp !== '' ? "empresa='" + empAp + "'" : '',
      '',
      50,
      0,
    )
    var cfgApv = null
    for (const ca of cfgAp) {
      if (!cfgApv || Number(ca.get('versao') || 0) > Number(cfgApv.get('versao') || 0)) cfgApv = ca
    }
    iniAp = cfgApv ? String(cfgApv.get('hora_inicio') || '08:00') : '08:00'
    const fimAp = cfgApv ? String(cfgApv.get('hora_fim') || '17:30') : '17:30'
    const brAp = new Date(agora - 3 * 3600000)
    const diaAp = brAp.getUTCDay()
    const hhAp = ('0' + brAp.getUTCHours()).slice(-2) + ':' + ('0' + brAp.getUTCMinutes()).slice(-2)
    const utilAp = diaAp >= 1 && diaAp <= 5
    dentroHorarioAp = utilAp && hhAp >= iniAp && hhAp <= fimAp
    if (diaAp === 5 || diaAp === 6) quandoAp = 'na segunda'
    else if (!utilAp) quandoAp = 'no próximo dia útil'
  } catch (eAp) {}

  if (!dentroHorarioAp) {
    // fora do horário: não enfileira agora; a fila também recusa
    return
  }

  function fmt(ms) {
    return new Date(ms).toISOString().replace('T', ' ')
  }
  function paraMs(v) {
    const s = String(v || '')
    if (s === '') return NaN
    return new Date(s.replace(' ', 'T')).getTime()
  }
  function digitos(v) {
    return String(v || '').replace(/\D/g, '')
  }
  // telefone canônico com e sem o 9 (o histórico guarda os dois jeitos)
  function variantes(tel) {
    const d = digitos(tel)
    const out = []
    if (d === '') return out
    var c = d
    if (c.indexOf('55') !== 0 && (c.length === 10 || c.length === 11)) c = '55' + c
    out.push(c)
    if (c.length === 13 && c.charAt(4) === '9') out.push(c.slice(0, 4) + c.slice(5))
    else if (c.length === 12) out.push(c.slice(0, 4) + '9' + c.slice(4))
    if (out.indexOf(d) < 0) out.push(d)
    return out
  }
  function aspas(v) {
    return String(v || '').replace(/'/g, '')
  }

  // ---------- 1. números de vendedor com a apresentação ligada ----------
  const vendedores = {}
  var algum = false
  try {
    const cxs = $app.findRecordsByFilter(
      'whatsapp_conexoes',
      "papel='vendedor' && ativo=true && apresentacao_ativa=true",
      '',
      50,
      0,
    )
    for (const c of cxs) {
      if (String(c.get('papel') || '') !== 'vendedor') continue
      if (c.get('ativo') !== true || c.get('apresentacao_ativa') !== true) continue
      if (String(c.get('modelo_apresentacao_vendedor') || '') === '') continue
      const u = String(c.get('vendedor_user') || '')
      if (u === '') continue
      vendedores[(String(c.get('fixture')) === 'true' ? 'f' : 'r') + '|' + u] = c
      algum = true
    }
  } catch (e1) {}
  if (!algum) return

  // ---------- 2. centrais ----------
  const centrais = {}
  try {
    const cs = $app.findRecordsByFilter('whatsapp_conexoes', "papel='central'", '', 10, 0)
    for (const c of cs) {
      if (String(c.get('papel') || '') === 'central') centrais[c.id] = true
    }
  } catch (e2) {}

  // ---------- 3. frases com o link do vendedor, de 15 min a 2 h atrás ----------
  var frases = []
  try {
    frases = $app.findRecordsByFilter(
      'whatsapp_envios',
      "(motivo='aviso_cliente' || motivo='ia_resposta') && texto~'wa.me/' && created<='" +
        fmt(agora - MINUTOS * 60000) +
        "' && created>='" +
        fmt(agora - JANELA_MAX_MIN * 60000) +
        "'",
      'created',
      300,
      0,
    )
  } catch (e3) {}

  const vistos = {}
  const naHora = {}
  for (const f of frases) {
    try {
      const motivoF = String(f.get('motivo') || '')
      if (motivoF !== 'aviso_cliente' && motivoF !== 'ia_resposta') continue
      if (!centrais[String(f.get('conexao') || '')]) continue
      if (String(f.get('texto') || '').indexOf('wa.me/') < 0) continue
      const criadoMs = paraMs(f.get('created'))
      if (isNaN(criadoMs)) continue
      if (agora - criadoMs < MINUTOS * 60000) continue
      if (agora - criadoMs > JANELA_MAX_MIN * 60000) continue

      // ---------- lead e dono ----------
      var leadId = String(f.get('lead') || '')
      if (leadId === '') {
        try {
          const cv = $app.findRecordsByFilter(
            'whatsapp_conversas',
            "conexao='" +
              aspas(f.get('conexao')) +
              "' && contato_telefone='" +
              aspas(f.get('destino_telefone')) +
              "'",
            '',
            1,
            0,
          )
          if (cv && cv.length > 0) leadId = String(cv[0].get('lead') || '')
        } catch (eCv) {}
      }
      if (leadId === '' || vistos[leadId]) continue
      vistos[leadId] = true

      var lead = null
      try {
        lead = $app.findRecordById('crm_leads', leadId)
      } catch (eL) {
        continue
      }
      const dono = String(lead.get('owner_id') || '')
      if (dono === '') continue
      const ehFix = String(f.get('fixture')) === 'true' || String(lead.get('fixture')) === 'true'
      const cxV = vendedores[(ehFix ? 'f' : 'r') + '|' + dono]
      if (!cxV) continue

      // ---------- uma vez por lead ----------
      const chave = 'apresentacao|' + leadId
      var jaTem = false
      try {
        const ja = $app.findRecordsByFilter(
          'whatsapp_envios',
          "dedupe_key='" + aspas(chave) + "'",
          '',
          1,
          0,
        )
        for (const j of ja) if (String(j.get('dedupe_key')) === chave) jaTem = true
      } catch (eJa) {}
      if (jaTem) continue

      // ---------- houve conversa entre o cliente e o vendedor depois da frase? ----------
      const tels = []
      for (const t of variantes(f.get('destino_telefone')).concat(
        variantes(lead.get('telefone')),
      )) {
        if (tels.indexOf(t) < 0) tels.push(t)
      }
      var cond = "lead='" + aspas(leadId) + "'"
      for (const t of tels) cond += " || contato_telefone='" + aspas(t) + "'"
      var houve = false
      try {
        const ms = $app.findRecordsByFilter(
          'whatsapp_mensagens',
          "conexao='" + aspas(cxV.id) + "' && created>='" + fmt(criadoMs) + "' && (" + cond + ')',
          '-created',
          20,
          0,
        )
        for (const m of ms) {
          if (String(m.get('conexao') || '') !== String(cxV.id)) continue
          if (paraMs(m.get('created')) < criadoMs) continue
          if (
            String(m.get('lead') || '') === leadId ||
            tels.indexOf(digitos(m.get('contato_telefone'))) >= 0
          ) {
            houve = true
            break
          }
        }
      } catch (eM) {
        continue // na dúvida, não manda
      }
      if (houve) continue

      // ---------- teto: 20 por hora por número ----------
      if (naHora[cxV.id] === undefined) {
        var n = 0
        try {
          const ult = $app.findRecordsByFilter(
            'whatsapp_envios',
            "conexao='" +
              aspas(cxV.id) +
              "' && motivo='apresentacao_vendedor' && created>='" +
              fmt(agora - 3600000) +
              "'",
            '',
            100,
            0,
          )
          for (const u of ult) {
            if (String(u.get('conexao')) !== String(cxV.id)) continue
            if (String(u.get('motivo')) !== 'apresentacao_vendedor') continue
            if (agora - paraMs(u.get('created')) > 3600000) continue
            n++
          }
        } catch (eT) {}
        naHora[cxV.id] = n
      }
      if (naHora[cxV.id] >= TETO_HORA) continue

      // ---------- variáveis do modelo ----------
      var primeiro =
        String(lead.get('nome') || '')
          .trim()
          .split(/\s+/)[0] || ''
      if (primeiro === '' || /\d/.test(primeiro)) primeiro = 'tudo bem'
      var nomeV = String(cxV.get('vendedor_nome_publico') || '').trim()
      if (nomeV === '') {
        try {
          const u = $app.findRecordById('users', dono)
          nomeV =
            String(u.get('name') || '')
              .trim()
              .split(/\s+/)[0] || ''
        } catch (eU) {}
      }
      if (nomeV === '') nomeV = 'Haisan'
      var destino = digitos(f.get('destino_telefone'))
      if (destino.length < 10) destino = variantes(lead.get('telefone'))[0] || ''
      if (destino.length < 10) continue
      const modelo = String(cxV.get('modelo_apresentacao_vendedor') || '')

      const env = new Record($app.findCollectionByNameOrId('whatsapp_envios'))
      env.set('lead', leadId)
      env.set('conexao', String(cxV.id))
      env.set('destino_telefone', destino)
      env.set('motivo', 'apresentacao_vendedor')
      env.set('modo', 'modelo')
      env.set('modelo_nome', modelo)
      env.set('legenda', primeiro + '|' + nomeV)
      env.set('variaveis', { 1: primeiro, 2: nomeV })
      env.set(
        'texto',
        'Apresentação de ' + nomeV + ' (modelo ' + modelo + '): o cliente não chamou em 15 min',
      )
      env.set('estado', 'pendente')
      env.set('tentativas', 0)
      env.set('dedupe_key', chave)
      env.set('criado_por', '')
      env.set('fixture', ehFix)
      $app.save(env)
      naHora[cxV.id] = naHora[cxV.id] + 1

      try {
        const ev = new Record($app.findCollectionByNameOrId('crm_lead_events'))
        ev.set('lead_id', leadId)
        ev.set('tipo', 'nota')
        ev.set(
          'texto',
          'Apresentação pelo número de ' +
            nomeV +
            ': o cliente não chamou o vendedor em 15 minutos depois do link.',
        )
        ev.set('fixture', ehFix)
        $app.save(ev)
      } catch (eEv) {}
    } catch (eF) {}
  }
})
