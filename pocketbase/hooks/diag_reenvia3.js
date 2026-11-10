/// <reference path="../pb_data/types.d.ts" />
/**
 * REENVIO DA APRESENTAÇÃO NOS 3 QUE FALHARAM (10/11) — CA-3-114.
 *
 * O Fábio, a Adriana e a Elisângela falharam. Agora que o parser do
 * `message.failed` está correto (CA-3-108), o reenvio mostra o motivo REAL.
 *
 * Envia para um número interno diferente do anterior e para o mesmo destino,
 * para comparar. Nunca para cliente.
 *
 * GET /backend/v1/diag/reenvia-3
 */
routerAdd(
  'GET',
  '/backend/v1/diag/reenvia-3',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, enviados: [] }

    // destinos internos da equipe (nunca cliente)
    const DESTINOS = ['5541999601233', '5541997675702', '5541998530911']
    const NOMES = ['Anezia', 'Marilda', 'Tatiane']

    var cxs = []
    try {
      cxs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='vendedor' && ativo=true && apresentacao_ativa=true",
        '',
        20,
        0,
      )
    } catch (e0) {
      return e.json(200, { ok: false, erro: String(e0).slice(0, 120) })
    }

    const colEnv = app.findCollectionByNameOrId('whatsapp_envios')
    var idx = 0
    for (const cx of cxs) {
      const nomeCx = String(cx.get('nome_exibicao') || '')
      if (nomeCx.toLowerCase().indexOf('fixture') >= 0) continue
      const modelo = String(cx.get('modelo_apresentacao_vendedor') || '')
      if (modelo === '') continue
      const destino = DESTINOS[idx % DESTINOS.length]
      const nomeDest = NOMES[idx % NOMES.length]
      idx++

      try {
        const env = new Record(colEnv)
        env.set('conexao', cx.id)
        env.set('destino_telefone', destino)
        env.set('motivo', 'teste')
        env.set('modo', 'modelo')
        env.set('modelo_nome', modelo)
        env.set('legenda', nomeDest + '|' + nomeCx.split(' ')[0])
        env.set('texto', 'reenvio CA-3-114 — ' + nomeCx)
        env.set('estado', 'pendente')
        env.set('tentativas', 0)
        env.set(
          'dedupe_key',
          'renv3|' + cx.id + '|' + String(new Date().getTime()) + '|' + String(idx),
        )
        env.set('fixture', false)
        app.save(env)
        out.enviados.push({
          numero: nomeCx,
          destino: nomeDest,
          envio: env.id,
        })
      } catch (e1) {
        out.enviados.push({ numero: nomeCx, erro: String(e1).slice(0, 90) })
      }
    }

    out.aviso = 'na fila; o cron envia e o webhook devolve o motivo real'
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
