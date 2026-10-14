/**
 * Hook de diagnóstico (task ea514702) — rota mínima para isolar o 404.
 * Se /backend/v1/ping responder 200, o carregamento de hooks funciona e o
 * problema está no ingestao.js; se responder 404, é bloqueio de plataforma.
 * (14/10: a rota de diagnóstico /backend/v1/debug-policy do card a70d5ab8 foi
 * removida — limpeza registrada no fechamento daquele card.)
 */
routerAdd('GET', '/backend/v1/ping', (e) => {
  return e.json(200, { ok: true, pong: new Date().toISOString() })
})
