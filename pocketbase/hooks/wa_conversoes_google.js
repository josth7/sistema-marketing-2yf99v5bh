/// <reference path="../pb_data/types.d.ts" />
/**
 * CANAL DO GOOGLE — o Maestro puxa as conversões pendentes (CA-3-61, 09/11).
 *
 * **O caminho:** a venda fecha no CRM → a conversão fica pendente → o Maestro
 * puxa pelo canal assinado a cada 6h → envia ao Google Ads pelo conector →
 * confirma de volta aqui.
 *
 * **O que a SPEC exige desta rota (e é o ponto sensível):**
 * devolver **só** `id`, `valor`, `moeda`, `data` (fuso −03:00), `gclid` e
 * `ph_google_sha256` — o telefone vai **hasheado em SHA-256**, nunca cru.
 * Nenhum nome. Nenhum telefone legível. Nenhuma sequência de 10+ dígitos.
 *
 * **Por que isso importa:** essa resposta sai do nosso sistema para outro
 * serviço. Se o telefone for cru, o dado pessoal do cliente viaja sem
 * necessidade — e a SPEC proíbe.
 *
 * **Assinatura:** a mesma do canal (`MAESTRO_SHARED_SECRET`), material
 * `ts.METHOD.caminho.query`, HMAC-SHA256, janela de 300s.
 *
 * Rotas:
 *   GET  /backend/v1/conversoes/google/pendentes  → até 200 pendentes
 *   POST /backend/v1/conversoes/{id}/google       → {estado, erro} (idempotente)
 */
routerAdd('GET', '/backend/v1/conversoes/google/pendentes', (e) => {
  // ---------- assinatura ----------
  var seg = ''
  try {
    seg = String($secrets.get('MAESTRO_SHARED_SECRET') || '')
  } catch (eS) {}
  if (seg === '') return e.json(503, { ok: false, erro: 'canal_indisponivel' })

  const tsHeader = String(e.request.header.get('X-Maestro-Timestamp') || '')
  const sigHeader = String(e.request.header.get('X-Maestro-Signature') || '')
  const agora = Math.floor(new Date().getTime() / 1000)
  const ts = Number(tsHeader)
  if (!tsHeader || !isFinite(ts) || Math.abs(agora - ts) > 300) {
    return e.json(401, { ok: false, erro: 'timestamp ausente ou fora da janela de 300s' })
  }
  const requestURI = String(e.request.requestURI || '')
  const posQ = requestURI.indexOf('?')
  const query = posQ >= 0 ? requestURI.slice(posQ + 1) : ''
  const caminho = requestURI.split('?')[0]
  const material = tsHeader + '.GET.' + caminho + '.' + query
  const esperada = $security.hs256(material, seg)
  var igual = false
  try {
    igual = $security.equal(esperada, sigHeader)
  } catch (eEq) {
    if (esperada.length === sigHeader.length) {
      var diff = 0
      for (var i = 0; i < esperada.length; i++) {
        diff |= esperada.charCodeAt(i) ^ sigHeader.charCodeAt(i)
      }
      igual = diff === 0
    }
  }
  if (!igual) return e.json(401, { ok: false, erro: 'assinatura inválida' })

  const app = $app
  var convs = []
  try {
    convs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('conversion_events'),
      'fixture=false',
      '',
      2000,
      0,
    )
  } catch (e0) {
    return e.json(200, { ok: false, erro: 'falha ao ler conversões' })
  }

  // ---------- monta só os campos permitidos ----------
  const itens = []
  const nomesLead = {}
  for (const c of convs) {
    // pendente para o Google = ainda não enviado e não cancelado
    const estG = String(c.get('estado_google') || 'pendente')
    if (estG !== '' && estG !== 'pendente' && estG !== 'pending') continue
    const valor = Number(c.get('valor') || 0)
    if (!(valor > 0)) continue
    const quando = String(c.get('created') || '')
    itens.push({
      id: c.id,
      valor: valor,
      moeda: 'BRL',
      data: quando,
      gclid: String(c.get('gclid') || '') || null,
      ph_google_sha256: String(c.get('ph_google_sha256') || '') || null,
    })
    if (itens.length >= 200) break
  }

  return e.json(200, {
    ok: true,
    total: itens.length,
    itens: itens,
    // aviso explícito para o consumidor não esperar telefone nem nome
    campos: ['id', 'valor', 'moeda', 'data', 'gclid', 'ph_google_sha256'],
  })
})

// ==================== CONFIRMAÇÃO DO MAESTRO ====================
routerAdd('POST', '/backend/v1/conversoes/{id}/google', (e) => {
  var seg = ''
  try {
    seg = String($secrets.get('MAESTRO_SHARED_SECRET') || '')
  } catch (eS) {}
  if (seg === '') return e.json(503, { ok: false, erro: 'canal_indisponivel' })

  const tsHeader = String(e.request.header.get('X-Maestro-Timestamp') || '')
  const sigHeader = String(e.request.header.get('X-Maestro-Signature') || '')
  const agora = Math.floor(new Date().getTime() / 1000)
  const ts = Number(tsHeader)
  if (!tsHeader || !isFinite(ts) || Math.abs(agora - ts) > 300) {
    return e.json(401, { ok: false, erro: 'timestamp ausente ou fora da janela de 300s' })
  }
  const requestURI = String(e.request.requestURI || '')
  const posQ = requestURI.indexOf('?')
  const query = posQ >= 0 ? requestURI.slice(posQ + 1) : ''
  const caminho = requestURI.split('?')[0]
  const material = tsHeader + '.POST.' + caminho + '.' + query
  const esperada = $security.hs256(material, seg)
  var igual = false
  try {
    igual = $security.equal(esperada, sigHeader)
  } catch (eEq) {
    if (esperada.length === sigHeader.length) {
      var diff = 0
      for (var i = 0; i < esperada.length; i++) {
        diff |= esperada.charCodeAt(i) ^ sigHeader.charCodeAt(i)
      }
      igual = diff === 0
    }
  }
  if (!igual) return e.json(401, { ok: false, erro: 'assinatura inválida' })

  var body = {}
  try {
    body = e.requestInfo().body || {}
  } catch (eB) {}
  const id = String(e.request.pathValue('id') || '')
  const estado = String(body.estado || '').toLowerCase()
  const erro = String(body.erro || '').slice(0, 300)

  if (['enviado', 'sent', 'erro', 'cancelado'].indexOf(estado) < 0) {
    return e.json(422, {
      ok: false,
      erro: 'estado inválido',
      aceitos: ['enviado', 'erro', 'cancelado'],
    })
  }

  var conv = null
  try {
    conv = $app.findRecordById('conversion_events', id)
  } catch (e1) {
    return e.json(404, { ok: false, erro: 'conversão não encontrada' })
  }

  // IDEMPOTENTE: confirmar duas vezes não muda nada nem duplica
  const atual = String(conv.get('estado_google') || '')
  if (atual !== '' && atual !== 'pendente' && atual !== 'pending') {
    return e.json(200, {
      ok: true,
      id: id,
      estado_google: atual,
      ja_confirmado: true,
    })
  }

  try {
    conv.set('estado_google', estado === 'sent' ? 'enviado' : estado)
    conv.set('erro_google', estado === 'erro' ? erro : '')
    if (estado === 'enviado' || estado === 'sent') {
      conv.set('enviado_google_em', new Date().toISOString())
    }
    $app.save(conv)
  } catch (e2) {
    return e.json(500, { ok: false, erro: 'não consegui confirmar: ' + String(e2).slice(0, 120) })
  }

  return e.json(200, {
    ok: true,
    id: id,
    estado_google: String(conv.get('estado_google') || ''),
  })
})
