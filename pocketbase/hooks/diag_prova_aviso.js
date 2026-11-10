/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA (10/11) — o aviso ao vendedor é entregue? (CA-3-112)
 *
 * Os 12 avisos de hoje falharam com 405 enquanto o backend estava instável.
 * Aqui se **reenfileira** um aviso (novo estado `pendente`) e aguarda a fila
 * enviar. O destino é o número do próprio vendedor dono.
 *
 * GET /backend/v1/diag/prova-aviso
 */
routerAdd(
  'GET',
  '/backend/v1/diag/prova-aviso',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, reenfileirados: 0, itens: [] }

    const colEnv = app.findCollectionByNameOrId('whatsapp_envios')
    try {
      const es = app.findRecordsByFilter(
        colEnv,
        "motivo='aviso_vendedor' && estado='erro_definitivo' && created>='2026-11-10'",
        '',
        20,
        0,
      )
      var n = 0
      for (const en of es) {
        if (n >= 3) break
        try {
          en.set('estado', 'pendente')
          en.set('tentativas', 0)
          en.set('ultimo_erro', '')
          en.set('dedupe_key', String(en.get('dedupe_key') || '') + '|r' + String(n))
          app.save(en)
          out.reenfileirados++
          n++
          out.itens.push({
            destino: String(en.get('destino_telefone') || '').slice(-6),
            texto: String(en.get('texto') || '').slice(0, 50),
          })
        } catch (e1) {
          out.itens.push({ erro: String(e1).slice(0, 80) })
        }
      }
    } catch (e2) {
      out.erro = String(e2).slice(0, 120)
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
