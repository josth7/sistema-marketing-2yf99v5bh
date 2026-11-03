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
  // desligado por padrao: so liga quando alguem confirmar os destinatarios
  const ATIVO = true

  if (!ATIVO) return
  try {
    const colDest = $app.findCollectionByNameOrId('whatsapp_avisos_email')
    var dests = []
    try {
      dests = $app.findRecordsByFilter(colDest, 'ativo=true', '', 100, 0)
    } catch (e0) {
      return
    }
    if (dests.length === 0) return // sem destinatario cadastrado: nao inventa

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
      if (!(idade >= 0) || idade > 3600000) continue // ultima hora
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

      // dedupe: um aviso por destinatario a cada 30 min (resume, nao inunda)
      const chave = 'aviso_email|' + email + '|' + Math.floor(agora / 1800000)
      try {
        const ja = $app.findRecordsByFilter(colEv, "dedupe_key='" + chave + "'", '', 1, 0)
        if (ja && ja.length > 0) continue
      } catch (e2) {}

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

      try {
        const ev = new Record(colEv)
        ev.set('dedupe_key', chave)
        ev.set('evento', 'aviso_email')
        ev.set('session_id', '')
        ev.set('ref_id', uid)
        ev.set('resultado', enviado ? 'enviado' : 'falha_smtp')
        ev.set('codigo_erro', email + ' | leads=' + lista.length)
        ev.set('trace_id', '')
        ev.set('duracao_ms', 0)
        ev.set('recebido_em', new Date().toISOString())
        ev.set('fixture', false)
        $app.save(ev)
      } catch (e3) {}
    }
  } catch (eTop) {}
})

// ==================== teste: envia um aviso agora ====================
routerAdd(
  'POST',
  '/backend/v1/whatsapp/avisos-email/testar',
  (e) => {
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
