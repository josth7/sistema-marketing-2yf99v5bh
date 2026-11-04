/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO TEMPORÁRIO (04/11) — o que o motor fez depois das 18:44?
 *
 * Os crons rodam (log "finished ok" às 19:03). A fila subiu de 22 para 46
 * registros. Mas as conversas em `transferida` não recebem a resposta.
 *
 * Aqui: lista os envios criados HOJE depois das 18:00 (qualquer motivo), o
 * estado e o erro de cada um — para ver se o motor enfileirou e a fila falhou,
 * ou se o motor não enfileirou nada.
 *
 * GET /backend/v1/diag/envios-hoje
 */
routerAdd(
  'GET',
  '/backend/v1/diag/envios-hoje',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const out = { total: 0, por_motivo: {}, por_estado: {}, itens: [] }
    var envios = []
    try {
      envios = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_envios'),
        '',
        '',
        500,
        0,
      )
    } catch (e0) {
      return e.json(200, { ok: false, erro: String(e0).slice(0, 200) })
    }
    out.total = envios.length

    const motivos = {}
    const estados = {}
    const lista = []
    for (const en of envios) {
      const m = String(en.get('motivo') || '(vazio)')
      const st = String(en.get('estado') || '(vazio)')
      motivos[m] = (motivos[m] || 0) + 1
      estados[st] = (estados[st] || 0) + 1
      const criado = String(en.get('created') || '')
      if (criado.indexOf('2026-11-04') !== 0) continue
      lista.push({
        created: criado.slice(0, 19),
        motivo: m,
        estado: st,
        destino: String(en.get('destino_telefone') || ''),
        erro: String(en.get('ultimo_erro') || '').slice(0, 60),
        tentativas: en.get('tentativas'),
        wa_id: String(en.get('wa_message_id') || '').slice(0, 18),
      })
    }
    lista.sort(function (a, b) {
      return b.created.localeCompare(a.created)
    })
    out.por_motivo = motivos
    out.por_estado = estados
    out.itens = lista.slice(0, 40)
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
