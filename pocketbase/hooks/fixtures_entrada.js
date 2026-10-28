/// <reference path="../pb_data/types.d.ts" />
/**
 * Fixture de mensagem de ENTRADA (SPEC-3-005, CA-3-16) — só para QA.
 *
 * POST /backend/v1/fixtures/whatsapp/entrada
 *   { lead_id, telefone, texto? }
 *
 * Cria a conversa (se faltar) e uma mensagem de entrada AGORA na central
 * fixture. Serve para abrir a janela de 24 h (RN-68) e provar que o aviso de
 * transferência sai como TEXTO dentro da janela, e como MODELO fora dela.
 *
 * Usa o segredo do webhook de fixture, que o próprio sistema lê do cofre;
 * nunca toca em conversa real (só conexão fixture).
 */

routerAdd('POST', '/backend/v1/fixtures/whatsapp/entrada', (e) => {
  // Guarda dupla: o segredo de fixture (para chamada de máquina) OU um usuário
  // logado com manage_leads (para o QA feito da tela/sessão). Continua não
  // sendo pública: sem segredo E sem login, é 403.
  const segredo = String($secrets.get('FIXTURE_TICK_SECRET') || '')
  const recebido = String(e.request.header.get('X-Fixture-Secret') || '')
  var autorizado = segredo !== '' && recebido === segredo
  if (!autorizado && e.auth) {
    try {
      const hoje = new Date().toISOString().slice(0, 10)
      const colG = $app.findCollectionByNameOrId('access_grants')
      const meus = $app.findRecordsByFilter(
        colG,
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '-created',
        60,
        0,
      )
      for (const g of meus) {
        const de = String(g.get('valid_from') || '')
        const ate = String(g.get('valid_until') || '')
        if (de !== '' && de.slice(0, 10) > hoje) continue
        if (ate !== '' && ate.slice(0, 10) < hoje) continue
        let acts = []
        try {
          const raw = g.get('actions')
          if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
            acts = JSON.parse(String.fromCharCode.apply(null, raw))
          } else if (typeof raw === 'string') {
            acts = JSON.parse(raw)
          } else {
            acts = raw || []
          }
        } catch (eA) {}
        if (acts.indexOf('manage_leads') >= 0) autorizado = true
      }
    } catch (eG) {}
  }
  if (!autorizado) {
    return e.json(403, { ok: false, erro: 'segredo de fixture inválido' })
  }

  const body = e.requestInfo().body || {}
  const leadId = String(body.lead_id || '')
  const telefone = String(body.telefone || '').replace(/\D/g, '')
  const texto = String(body.texto || 'Oi, quero um orçamento')

  if (leadId === '' || telefone === '') {
    return e.json(422, { ok: false, erro: 'lead_id e telefone são obrigatórios' })
  }

  // central fixture (a real nunca é tocada por teste)
  const colCx = $app.findCollectionByNameOrId('whatsapp_conexoes')
  const cxs = $app.findRecordsByFilter(colCx, "fixture=true && papel='central'", '', 1, 0)
  if (!cxs || cxs.length === 0) {
    return e.json(422, { ok: false, erro: 'conexao central fixture ausente' })
  }
  const conexao = cxs[0]

  // conversa (cria se não existir)
  const colConv = $app.findCollectionByNameOrId('whatsapp_conversas')
  var conversa = null
  try {
    const achadas = $app.findRecordsByFilter(
      colConv,
      "conexao='" + conexao.id + "' && contato_telefone='" + telefone + "'",
      '',
      1,
      0,
    )
    if (achadas && achadas.length > 0) conversa = achadas[0]
  } catch (e1) {}
  if (!conversa) {
    const nc = new Record(colConv)
    nc.set('conexao', conexao.id)
    nc.set('contato_telefone', telefone)
    nc.set('contato_nome', 'Contato QA')
    nc.set('lead', leadId)
    nc.set('total_mensagens', 0)
    nc.set('estado', 'triagem')
    nc.set('fixture', true)
    $app.save(nc)
    conversa = nc
  } else {
    conversa.set('lead', leadId)
    try {
      $app.save(conversa)
    } catch (e2) {}
  }

  // mensagem de ENTRADA agora (abre a janela de 24 h)
  const agora = new Date().toISOString()
  const colMsg = $app.findCollectionByNameOrId('whatsapp_mensagens')
  const msg = new Record(colMsg)
  msg.set('conexao', conexao.id)
  msg.set('contato_telefone', telefone)
  msg.set('direcao', 'entrada')
  msg.set('autor', 'cliente')
  msg.set('tipo', 'text')
  msg.set('texto', texto)
  msg.set('status', 'recebida')
  msg.set('enviada_em', agora)
  msg.set('wa_message_id', 'fixture-entrada-' + String(Date.now()))
  msg.set('fixture', true)
  try {
    $app.save(msg)
  } catch (eM) {
    return e.json(422, {
      ok: false,
      erro: 'falha ao gravar mensagem',
      detalhe: String(eM).slice(0, 140),
    })
  }

  try {
    conversa.set('ultima_mensagem_em', agora)
    conversa.set('ultima_previa', texto.slice(0, 160))
    conversa.set('ultimo_autor', 'cliente')
    conversa.set('total_mensagens', Number(conversa.get('total_mensagens') || 0) + 1)
    $app.save(conversa)
  } catch (e3) {}

  return e.json(200, {
    ok: true,
    conversa: conversa.id,
    conexao: conexao.id,
    mensagem: msg.id,
    enviada_em: agora,
  })
})
