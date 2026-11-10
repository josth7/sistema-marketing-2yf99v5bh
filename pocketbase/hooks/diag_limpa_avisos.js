/// <reference path="../pb_data/types.d.ts" />
/**
 * LIMPA E CONFERE (10/11) — CA-3-112.
 *
 * Os avisos gerados antes da correção do destino têm ID no lugar do telefone.
 * Aqui se apagam esses (nunca sairão) e se mostra o estado da fila.
 *
 * GET /backend/v1/diag/limpa-avisos
 */
routerAdd(
  'GET',
  '/backend/v1/diag/limpa-avisos',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, removidos: 0, restantes: [] }

    const colEnv = app.findCollectionByNameOrId('whatsapp_envios')
    try {
      const es = app.findRecordsByFilter(colEnv, "motivo='aviso_vendedor'", '', 200, 0)
      for (const en of es) {
        const destino = String(en.get('destino_telefone') || '')
        const estado = String(en.get('estado') || '')
        const criado = String(en.get('created') || '').slice(0, 10)
        // avisos de hoje com destino que não é telefone (ID) são lixo
        if (criado >= '2026-11-10' && (destino.length < 10 || estado === 'sem_numero')) {
          try {
            app.delete(en)
            out.removidos++
          } catch (e1) {}
        } else if (out.restantes.length < 8) {
          out.restantes.push({ destino: destino.slice(-6), estado: estado, criado: criado })
        }
      }
    } catch (e2) {
      out.erro = String(e2).slice(0, 120)
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
