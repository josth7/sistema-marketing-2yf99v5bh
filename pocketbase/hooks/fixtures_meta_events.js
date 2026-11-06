/// <reference path="../pb_data/types.d.ts" />
/**
 * FIXTURE DA API DE CONVERSÕES — CA-3-60 (SPEC-3-014, 06/11).
 *
 * **Por que existe:** provar o envio de venda para a Meta exige um endereço que
 * responda como a Meta. Apontando o cron para cá (`META_CAPI_BASE_URL`), o
 * caminho inteiro é exercitado **sem tocar na conta real** e sem gastar nada.
 *
 * **O que ela imita:**
 *   - **200**: aceita, devolve `events_received: 1` (o caso normal);
 *   - **401**: token inválido (o cron não deve insistir);
 *   - **429**: limite de requisições (o cron deve tentar de novo);
 *   - **500**: erro do servidor (até 3 tentativas).
 *
 * O status desejado vem na query: `?status=401`.
 *
 * **Guardada por segredo:** só responde com `X-Fixture-Secret` correto, para
 * ninguém de fora forjar resposta de conversão.
 *
 * POST /backend/v1/fixtures/meta/events?status=200
 */
routerAdd('POST', '/backend/v1/fixtures/meta/events', (e) => {
  // ---------- guarda (só o segredo, como as outras fixtures) ----------
  // O cron chama sem login; a proteção é o segredo compartilhado.
  var segredo = ''
  try {
    segredo = String($secrets.get('FIXTURE_TICK_SECRET') || '')
  } catch (e0) {}
  const enviado = String(e.request.header.get('X-Fixture-Secret') || '')
  if (segredo === '' || enviado !== segredo) {
    return e.json(403, { ok: false, erro: 'segredo inválido' })
  }

  // ---------- status pedido ----------
  var status = 200
  try {
    status = Number(e.request.url.query().get('status') || 200)
  } catch (e1) {}

  // ---------- corpo recebido (só a contagem, sem dado pessoal) ----------
  var quantos = 0
  try {
    const body = e.requestInfo().body || {}
    if (Array.isArray(body.data)) quantos = body.data.length
  } catch (e2) {}

  if (status === 200) {
    return e.json(200, {
      events_received: quantos,
      messages: [],
      fbtrace_id: 'fixture-' + String(new Date().getTime()),
    })
  }
  if (status === 401 || status === 403) {
    return e.json(status, {
      error: {
        message: 'Invalid OAuth access token',
        code: 190,
        title: 'token inválido (fixture)',
      },
    })
  }
  if (status === 429) {
    return e.json(429, {
      error: {
        message: 'Rate limit hit',
        code: 4,
        title: 'limite de requisições (fixture)',
      },
    })
  }
  return e.json(status >= 500 ? status : 500, {
    error: { message: 'erro do servidor (fixture)', code: 2 },
  })
})
