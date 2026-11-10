/// <reference path="../pb_data/types.d.ts" />
/**
 * AVISO DE LEAD NOVO POR E-MAIL (03/11).
 *
 * Por que existe: o WhatsApp está bloqueado pela Meta (130497). O cron que
 * distribui lead grava o dono, mas o vendedor não fica sabendo de nada. E-mail
 * não depende da Meta.
 *
 * O QUE FAZ (cron `wa_aviso_email`, 5 min):
 *   - pega leads distribuídos nos últimos 60 min que ainda não foram avisados
 *   - manda UM e-mail por vendedor, juntando os leads dele (não um por lead:
 *     evita enxurrada)
 *   - registra em whatsapp_eventos (dedupe) para não repetir
 *
 * DESTINATÁRIOS: configurados em `whatsapp_avisos_email` (coleção nova).
 * Se não houver cadastro, não envia — não inventa endereço.
 *
 * ENVIO: SMTP do próprio Skip (skip_cloud_configure_smtp). O cron chama a rota
 * interna de e-mail; se o SMTP não estiver configurado, registra `sem_smtp`
 * e não quebra.
 *
 * JSVM: tudo INLINE.
 */

// ==================== cadastro de destinatários ====================
routerAdd(
  'GET',
  '/backend/v1/whatsapp/avisos-email',
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
    const col = $app.findCollectionByNameOrId('whatsapp_avisos_email')
    var regs = []
    try {
      regs = $app.findRecordsByFilter(col, '', '', 100, 0)
    } catch (e0) {
      return e.json(200, { ok: true, total: 0, itens: [] })
    }
    const itens = []
    for (const r of regs) {
      itens.push({
        id: r.id,
        user_id: String(r.get('user_id') || ''),
        nome: String(r.get('nome') || ''),
        email: String(r.get('email') || ''),
        ativo: r.get('ativo') === true,
      })
    }
    return e.json(200, { ok: true, total: itens.length, itens: itens })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/whatsapp/avisos-email',
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
    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {}
    const email = String(body.email || '').trim()
    if (email === '' || email.indexOf('@') < 0) {
      return e.json(422, { ok: false, erro: 'informe um e-mail válido' })
    }
    const col = $app.findCollectionByNameOrId('whatsapp_avisos_email')
    // dedupe por e-mail
    try {
      const ja = $app.findRecordsByFilter(col, "email='" + email.replace(/'/g, '') + "'", '', 1, 0)
      if (ja && ja.length > 0) {
        ja[0].set('ativo', true)
        ja[0].set('nome', String(body.nome || ja[0].get('nome') || ''))
        ja[0].set('user_id', String(body.user_id || ja[0].get('user_id') || ''))
        $app.save(ja[0])
        return e.json(200, { ok: true, id: ja[0].id, atualizado: true })
      }
    } catch (eD) {}
    const rec = new Record(col)
    rec.set('email', email)
    rec.set('nome', String(body.nome || ''))
    rec.set('user_id', String(body.user_id || ''))
    rec.set('ativo', true)
    try {
      $app.save(rec)
    } catch (eS) {
      return e.json(500, { ok: false, erro: 'falha ao salvar: ' + String(eS) })
    }
    return e.json(200, { ok: true, id: rec.id })
  },
  $apis.requireAuth(),
)

// ==================== cron do aviso ====================
cronAdd('wa_aviso_email', '*/5 * * * *', () => {
  // CA-3-48 (06/11): QUEM DECIDE É A TELA ADMINISTRAÇÃO, não uma constante.
  // Antes o `ATIVO = true` fixo fazia o cron ignorar o liga/desliga da gestão —
  // a tela dizia "desligado" e o e-mail saía do mesmo jeito.
  var cfgAdm = null
  try {
    const vs = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('admin_config'),
      '',
      '',
      200,
      0,
    )
    for (const v of vs) {
      if (!cfgAdm || Number(v.get('versao') || 0) > Number(cfgAdm.get('versao') || 0)) cfgAdm = v
    }
  } catch (eCfg) {}
  if (!cfgAdm) return
  if (cfgAdm.get('email_ativo') !== true) return

  // destinatários vêm da Administração
  var destIds = []
  try {
    const rawD = cfgAdm.get('email_destinatarios')
    destIds =
      Array.isArray(rawD) && rawD.length > 0 && typeof rawD[0] === 'number'
        ? JSON.parse(String.fromCharCode.apply(null, rawD))
        : typeof rawD === 'string'
          ? JSON.parse(rawD)
          : rawD || []
  } catch (eD) {}
  if (!Array.isArray(destIds) || destIds.length === 0) return
  // heartbeat: sem isso eu nao sabia se o cron rodava ou nao (03/11)
  console.log('wa_aviso_email: rodando')
  try {
    // destino: as PESSOAS escolhidas na Administração (email do cadastro).
    // A coleção `whatsapp_avisos_email` fica como histórico do que foi enviado.
    var dests = []
    try {
      for (const uid of destIds) {
        try {
          const u = $app.findRecordById('users', String(uid))
          const em = String(u.get('email') || '')
          if (em !== '') {
            // objeto com `get`, igual ao registro: o resto do cron usa d.get(...)
            const dados = {
              user_id: String(uid),
              email: em,
              nome: String(u.get('name') || em),
            }
            dests.push({
              get: function (k) {
                return dados[k]
              },
            })
          }
        } catch (eU) {}
      }
    } catch (e0) {}
    if (dests.length === 0) return // sem destinatario valido: nao inventa

    const colL = $app.findCollectionByNameOrId('crm_leads')
    const colEv = $app.findCollectionByNameOrId('whatsapp_eventos')

    // leads distribuidos na ultima hora
    const agora = new Date().getTime()
    var leads = []
    try {
      leads = $app.findRecordsByFilter(colL, 'fixture=false', '', 6000, 0)
    } catch (e1) {
      return
    }

    // agrupa por dono
    const porDono = {}
    for (const l of leads) {
      const ow = String(l.get('owner_id') || '')
      if (ow === '') continue
      const upd = String(l.get('updated') || '')
      if (upd === '') continue
      const idade = agora - new Date(upd).getTime()
      // 24h (nao 1h): o primeiro aviso cobre o dia inteiro, senao lead
      // distribuido de manha nunca e avisado
      if (!(idade >= 0) || idade > 24 * 3600000) continue
      porDono[ow] = porDono[ow] || []
      porDono[ow].push(l)
    }

    for (const d of dests) {
      const uid = String(d.get('user_id') || '')
      const email = String(d.get('email') || '')
      if (email === '') continue
      var lista = []
      if (uid !== '') {
        lista = porDono[uid] || []
      } else {
        // sem user_id: manda o consolidado (gestao)
        for (const k in porDono) {
          for (const l of porDono[k]) lista.push(l)
        }
      }
      if (lista.length === 0) continue

      // ---------- DEDUPE POR LEAD (nao por tempo) ----------
      // A primeira versao usava chave por janela de 30 min: isso REENVIAVA
      // tudo a cada meia hora, para sempre (medido em 03/11 — 5 e-mails com
      // 343 leads). Agora a chave e o LEAD: cada lead avisa uma vez por
      // destinatario, e so os novos entram no proximo e-mail.
      var novos = []
      for (const l of lista) {
        const k = 'aviso_email|' + email + '|' + l.id
        var jaFoi = false
        try {
          const ja = $app.findRecordsByFilter(colEv, "dedupe_key='" + k + "'", '', 1, 0)
          if (ja && ja.length > 0) jaFoi = true
        } catch (eDed) {
          jaFoi = false
        }
        if (!jaFoi) novos.push(l)
      }
      if (novos.length === 0) continue
      lista = novos
      const chave = 'aviso_email|' + email + '|' + lista[0].id

      // monta o corpo
      var corpo =
        'Ola' + (String(d.get('nome') || '') !== '' ? ' ' + String(d.get('nome')) : '') + ',\n\n'
      corpo += 'Voce tem ' + lista.length + ' lead(s) novo(s) para atender na Haisan:\n\n'
      var cont = 0
      for (const l of lista) {
        if (cont >= 30) {
          corpo += '\n... e mais ' + (lista.length - 30) + '.\n'
          break
        }
        corpo +=
          '- ' +
          String(l.get('nome') || '(sem nome)') +
          ' | ' +
          String(l.get('telefone') || '(sem telefone)') +
          ' | ' +
          String(l.get('origem') || '') +
          ' | ' +
          String(l.get('status') || '') +
          '\n'
        cont++
      }
      corpo += '\nAbra o sistema para ver a conversa: https://sistema-marketing-1f51e.goskip.app\n'
      corpo +=
        '\n(Aviso automatico. O envio pelo WhatsApp esta bloqueado pela Meta — responda pelo celular.)\n'

      // envia pelo SMTP do proprio Skip
      var enviado = false
      try {
        const msg = new MailerMessage({
          from: {
            address: $app.settings().meta.senderAddress || 'nao-responda@haisan.com.br',
            name: $app.settings().meta.senderName || 'Haisan',
          },
          to: [{ address: email }],
          subject: 'Haisan — ' + lista.length + ' lead(s) novo(s) para voce',
          text: corpo,
        })
        $app.newMailClient().send(msg)
        enviado = true
      } catch (eMail) {
        console.log('wa_aviso_email: falha ao enviar para ' + email + ': ' + String(eMail))
      }

      // marca CADA lead do lote como avisado
      for (const l of lista) {
        try {
          const ev = new Record(colEv)
          ev.set('dedupe_key', 'aviso_email|' + email + '|' + l.id)
          ev.set('evento', 'aviso_email')
          ev.set('session_id', '')
          ev.set('ref_id', l.id)
          ev.set('resultado', enviado ? 'enviado' : 'falha_smtp')
          ev.set('codigo_erro', email)
          ev.set('trace_id', '')
          ev.set('duracao_ms', 0)
          ev.set('recebido_em', new Date().toISOString())
          ev.set('fixture', false)
          $app.save(ev)
        } catch (e3) {}
      }
    }
  } catch (eTop) {}
})

// ==================== teste: envia um aviso agora ====================
routerAdd(
  'POST',
  '/backend/v1/whatsapp/avisos-email/testar',
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
    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {}
    const email = String(body.email || '').trim()
    if (email.indexOf('@') < 0) return e.json(422, { ok: false, erro: 'informe um e-mail válido' })
    try {
      const msg = new MailerMessage({
        from: {
          address: $app.settings().meta.senderAddress || 'nao-responda@haisan.com.br',
          name: $app.settings().meta.senderName || 'Haisan',
        },
        to: [{ address: email }],
        subject: 'Haisan — teste do aviso de lead',
        text: 'Este e um teste do aviso automatico de lead novo.\n\nSe voce recebeu, o e-mail funciona e o aviso pode ser ligado para o time.\n',
      })
      $app.newMailClient().send(msg)
      return e.json(200, { ok: true, enviado: true, para: email })
    } catch (eMail) {
      return e.json(200, { ok: false, erro: String(eMail), para: email })
    }
  },
  $apis.requireAuth(),
)
