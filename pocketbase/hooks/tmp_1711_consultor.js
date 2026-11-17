/// <reference path="../pb_data/types.d.ts" />
/**
 * TEMPORÁRIO (17/11, consultor Adapta) — SÓ LEITURA. Apagar depois de rodar.
 *
 * 1ª rodada (19:43 UTC) já feita: a conta rodrigo@adapta não era dona de
 * nenhum lead nem estava em carteira (nada desvinculado).
 *
 * 2ª rodada: mede o atendimento parado de hoje:
 *   A. contas que o robô trata como "vendedor" sem ter número de vendedor;
 *   B. quantas mensagens ao cliente anunciaram essas contas;
 *   C. avisos ao vendedor de hoje (estado e erro);
 *   D. apresentações pelo número do vendedor desde 16/11 (estado e erro);
 *   E. foto da lista "esperando" (cliente com a última mensagem).
 * Roda só entre 19:46 e 20:20 UTC de 17/11/2026, uma vez. Não grava nada.
 * Nenhum telefone vai para o log.
 */
cronAdd('tmp_1711_consultor', '* * * * *', () => {
  const agora = new Date().getTime()
  const ini = new Date('2026-11-17T19:46:00Z').getTime()
  const fim = new Date('2026-11-17T20:20:00Z').getTime()
  if (agora < ini || agora > fim) return
  try {
    if ($app.store().get('tmp1711_diag2') === true) return
    $app.store().set('tmp1711_diag2', true)
  } catch (eSt) {
    if (new Date().getUTCMinutes() % 5 !== 0) return
  }

  const P = 'tmp1711b: '
  function mask(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[0-9]{8,}/g, '***')
  }
  function lerL(raw) {
    try {
      if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
        return JSON.parse(String.fromCharCode.apply(null, raw))
      }
      if (typeof raw === 'string') return JSON.parse(raw)
      return raw || []
    } catch (err) {
      return []
    }
  }
  function buscar(col, filtro, ordem, limite) {
    try {
      return $app.findRecordsByFilter(col, filtro, ordem, limite, 0)
    } catch (e1) {
      try {
        return $app.findRecordsByFilter(col, filtro, '', limite, 0)
      } catch (e2) {
        console.log(P + 'busca falhou em ' + col + ': ' + String(e2).slice(0, 120))
        return []
      }
    }
  }
  function conta(obj, k) {
    obj[k] = (obj[k] || 0) + 1
  }

  const cxNome = {}
  const cxs = buscar('whatsapp_conexoes', '', '', 100)
  for (const c of cxs)
    cxNome[c.id] = String(c.get('nome_exibicao') || '') + '/' + String(c.get('papel') || '')

  // ---------- A. "vendedores" do robô sem número de vendedor ----------
  const comCx = {}
  for (const c of cxs) {
    if (
      String(c.get('papel')) === 'vendedor' &&
      c.get('ativo') === true &&
      String(c.get('fixture')) !== 'true'
    ) {
      comCx[String(c.get('vendedor_user') || '')] = true
    }
  }
  const nomesUser = {}
  const falsos = []
  for (const u of buscar('users', '', '', 300)) {
    const em = String(u.get('email') || '')
    const nm = String(u.get('name') || '')
    nomesUser[u.id] = nm || em
    if (
      em === '' ||
      em.toLowerCase().indexOf('fixture') >= 0 ||
      nm.toLowerCase().indexOf('fixture') >= 0
    )
      continue
    if (em.indexOf('josth') >= 0) continue
    var vd = false
    var gt = false
    for (const g of buscar('access_grants', "user_id='" + u.id + "' && revoked_at=''", '', 20)) {
      const a = lerL(g.get('actions'))
      const sc = lerL(g.get('scope_accounts'))
      if (Array.isArray(sc) && sc.indexOf('*') >= 0) gt = true
      if (Array.isArray(a) && (a.indexOf('read_conversas') >= 0 || a.indexOf('read_leads') >= 0))
        vd = true
    }
    if (vd && !gt && !comCx[u.id]) falsos.push({ id: u.id, nome: nm, email: em })
  }
  console.log(
    P +
      'A. contas tratadas como vendedor pelo robo SEM numero de vendedor = ' +
      falsos.length +
      ' -> ' +
      JSON.stringify(
        falsos.map(function (f) {
          return f.email + ' (' + f.nome + ')'
        }),
      ),
  )

  // ---------- B. mensagens ao cliente que anunciaram essas contas ----------
  for (const f of falsos) {
    const termos = [f.email]
    if (f.nome !== '') termos.push(f.nome)
    for (const t of termos) {
      const es = buscar(
        'whatsapp_envios',
        "texto~'" + t.replace(/'/g, '') + "' && (motivo='ia_resposta' || motivo='aviso_cliente')",
        '',
        2000,
      )
      if (es.length === 0) continue
      const porDia = {}
      const leads = {}
      for (const e of es) {
        conta(porDia, String(e.get('created')).slice(0, 10))
        leads[String(e.get('lead') || e.get('destino_telefone') || '').slice(-6)] = true
      }
      console.log(
        P +
          'B. anunciou "' +
          t +
          '" -> ' +
          es.length +
          ' msgs, ' +
          Object.keys(leads).length +
          ' clientes | por dia ' +
          JSON.stringify(porDia),
      )
    }
  }

  // ---------- C. avisos ao vendedor de hoje ----------
  const hoje = '2026-11-17 03:00:00'
  const av = buscar(
    'whatsapp_envios',
    "motivo='aviso_vendedor' && created>='" + hoje + "'",
    '',
    2000,
  )
  const avEst = {}
  for (const e of av)
    conta(
      avEst,
      String(e.get('estado')) +
        ' | ' +
        (cxNome[String(e.get('conexao') || '')] || '?') +
        ' | ' +
        mask(e.get('ultimo_erro')).slice(0, 50),
    )
  console.log(P + 'C. avisos ao vendedor hoje = ' + av.length + ' | ' + JSON.stringify(avEst))

  // ---------- D. apresentações desde 16/11 ----------
  const ap = buscar(
    'whatsapp_envios',
    "motivo='apresentacao_vendedor' && created>='2026-11-16 03:00:00'",
    '',
    2000,
  )
  const apEst = {}
  for (const e of ap)
    conta(
      apEst,
      (cxNome[String(e.get('conexao') || '')] || '?') +
        ' | ' +
        String(e.get('estado')) +
        ' | modelo=' +
        String(e.get('modelo_nome') || '') +
        ' | ' +
        mask(e.get('ultimo_erro')).slice(0, 40),
    )
  console.log(P + 'D. apresentacoes desde 16/11 = ' + ap.length + ' | ' + JSON.stringify(apEst))
  for (const c of cxs) {
    if (String(c.get('papel')) !== 'vendedor' || String(c.get('fixture')) === 'true') continue
    console.log(
      P +
        'D. conexao ' +
        cxNome[c.id] +
        ' | apresentacao_ativa=' +
        c.get('apresentacao_ativa') +
        ' | modelo=' +
        String(c.get('modelo_apresentacao_vendedor') || '') +
        ' | nome_publico=' +
        String(c.get('vendedor_nome_publico') || ''),
    )
  }
  const ultAp = buscar(
    'whatsapp_envios',
    "motivo='apresentacao_vendedor' && created>='2026-11-17 03:00:00'",
    '-created',
    1,
  )
  if (ultAp.length > 0) {
    const vs = String(ultAp[0].get('legenda') || '').split('|')
    console.log(
      P +
        'D. ultima apresentacao: modelo=' +
        ultAp[0].get('modelo_nome') +
        ' idioma=' +
        String(ultAp[0].get('modelo_idioma') || '(vazio->pt_BR)') +
        ' qtd_variaveis=' +
        vs.length +
        ' tamanhos=' +
        JSON.stringify(
          vs.map(function (x) {
            return x.length
          }),
        ),
    )
  }

  // ---------- E. foto da lista "esperando" ----------
  const leadInfo = {}
  for (const l of buscar('crm_leads', 'fixture=false', '', 12000)) {
    leadInfo[l.id] = String(l.get('owner_id') || '')
  }
  const porCli = {}
  for (const cv of buscar('whatsapp_conversas', 'fixture=false', '', 8000)) {
    if (String(cv.get('interna')) === 'true' || String(cv.get('nao_cliente')) === 'true') continue
    var d = String(cv.get('contato_telefone') || '').replace(/\D/g, '')
    if (d === '') continue
    if (d.indexOf('55') === 0 && d.length > 11) d = d.slice(2)
    if (d.length === 11 && d.charAt(2) === '9') d = d.slice(0, 2) + d.slice(3)
    if (!porCli[d]) porCli[d] = []
    porCli[d].push(cv)
  }
  var total = 0
  var hojeN = 0
  const porDono = {}
  const porNum = {}
  const porEstado = {}
  const faixas = { ate_1h: 0, ate_24h: 0, ate_7d: 0, mais_7d: 0 }
  const hojeIni = new Date('2026-11-17T03:00:00Z').getTime()
  for (const k in porCli) {
    var uCli = 0
    var uNossa = 0
    var cvR = null
    var lead = ''
    var resolv = 0
    for (const cv of porCli[k]) {
      const q = new Date(String(cv.get('ultima_mensagem_em') || '').replace(' ', 'T')).getTime()
      if (q > 0) {
        if (String(cv.get('ultimo_autor') || '') === 'cliente') {
          if (q > uCli) {
            uCli = q
            cvR = cv
          }
        } else if (q > uNossa) uNossa = q
      }
      if (lead === '' && String(cv.get('lead') || '') !== '') lead = String(cv.get('lead'))
      const rq = new Date(String(cv.get('resolvida_em') || '').replace(' ', 'T')).getTime()
      if (rq > resolv) resolv = rq
    }
    if (!(uCli > 0 && uCli > uNossa)) continue
    if (resolv > 0 && uCli <= resolv) continue
    total++
    if (uCli >= hojeIni) hojeN++
    const dono = lead !== '' ? leadInfo[lead] || '' : ''
    conta(porDono, dono === '' ? 'SEM DONO' : nomesUser[dono] || dono)
    conta(porNum, cxNome[String(cvR.get('conexao') || '')] || '?')
    conta(porEstado, String(cvR.get('estado') || ''))
    const h = (agora - uCli) / 3600000
    if (h <= 1) faixas.ate_1h++
    else if (h <= 24) faixas.ate_24h++
    else if (h <= 168) faixas.ate_7d++
    else faixas.mais_7d++
  }
  console.log(
    P +
      'E. esperando (sem filtro de agradecimento) = ' +
      total +
      ' | ultima msg do cliente hoje = ' +
      hojeN +
      ' | faixas=' +
      JSON.stringify(faixas),
  )
  console.log(P + 'E. por dono = ' + JSON.stringify(porDono))
  console.log(
    P +
      'E. por numero = ' +
      JSON.stringify(porNum) +
      ' | estado da conversa = ' +
      JSON.stringify(porEstado),
  )
})
