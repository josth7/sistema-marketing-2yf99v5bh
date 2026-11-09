/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (09/11) — as recusas da Meta gravadas no evento.
 *
 * O webhook grava em `whatsapp_eventos` os campos: `evento`, `resultado`,
 * `codigo_erro`, `ref_id`. Aqui se listam os eventos de falha de 09/11 com o
 * que foi guardado — para saber se o código real entrou ou ficou vazio.
 *
 * GET /backend/v1/diag/recusas-meta
 */
routerAdd(
  'GET',
  '/backend/v1/diag/recusas-meta',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, total: 0, com_codigo: 0, sem_codigo: 0, por_evento: {}, amostra: [] }

    var evs = []
    try {
      evs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_eventos'),
        '',
        '',
        600,
        0,
      )
    } catch (e0) {
      return e.json(200, { ok: false, erro: String(e0).slice(0, 140) })
    }

    for (const ev of evs) {
      const nome = String(ev.get('evento') || '')
      out.por_evento[nome] = (out.por_evento[nome] || 0) + 1
      if (nome.indexOf('failed') < 0 && nome.indexOf('falh') < 0) continue
      out.total++
      const cod = String(ev.get('codigo_erro') || '')
      if (cod !== '') out.com_codigo++
      else out.sem_codigo++
      if (out.amostra.length < 6) {
        out.amostra.push({
          evento: nome,
          resultado: String(ev.get('resultado') || ''),
          codigo: cod || '(vazio)',
          quando: String(ev.get('recebido_em') || ev.get('created') || '').slice(0, 16),
        })
      }
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
