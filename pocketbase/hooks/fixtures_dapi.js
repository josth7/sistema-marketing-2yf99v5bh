/// <reference path="../pb_data/types.d.ts" />
/**
 * Fixture de envio da D-API (SPEC-3-005, RN-69).
 *
 * A fila de envios, quando a conexão é fixture, NUNCA chama a D-API real:
 * chama esta rota, que responde o status pedido em `?status=NNN` (padrão 200).
 * É assim que se prova 2xx → enviado, 500 → nova tentativa (3x) → erro
 * definitivo, e 4xx → erro_definitivo sem repetir.
 *
 * Protegida por `X-Fixture-Secret` = FIXTURE_TICK_SECRET (regra do projeto:
 * toda rota de teste exige o segredo e só atua sobre registros fixture).
 */

routerAdd('POST', '/backend/v1/fixtures/dapi/send', (e) => {
  const segredo = String($secrets.get('FIXTURE_TICK_SECRET') || '')
  const recebido = String(e.request.header.get('X-Fixture-Secret') || '')
  if (segredo === '' || recebido !== segredo) {
    return e.json(403, { ok: false, erro: 'segredo de fixture inválido' })
  }

  // status pedido pela query (via requestURI: e.request.url().rawQuery lança no JSVM)
  var status = 200
  try {
    const uri = String(e.request.requestURI || '')
    const pos = uri.indexOf('status=')
    if (pos >= 0) {
      const resto = uri.slice(pos + 7)
      const fim = resto.search(/[^0-9]/)
      const numero = fim >= 0 ? resto.slice(0, fim) : resto
      if (numero !== '') status = Number(numero)
    }
  } catch (eQ) {}

  const body = e.requestInfo().body || {}
  const destino = String(body.to || '')

  if (status >= 200 && status < 300) {
    // devolve um id no mesmo formato da D-API, para casar o espelho (RN-63)
    return e.json(status, {
      ok: true,
      id: 'fixture-' + String(destino).slice(-6) + '-' + String(Date.now()),
      status: 'sent',
      sessionId: String(body.sessionId || ''),
    })
  }
  return e.json(status, { ok: false, erro: 'fixture_status_' + status })
})
