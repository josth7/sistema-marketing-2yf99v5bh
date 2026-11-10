/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA DA APRESENTAÇÃO NOS 4 NÚMEROS (10/11) — CA-3-114.
 *
 * Para cada vendedor com apresentação ligada, enfileira o modelo de
 * apresentação para um **número interno da equipe** (nunca cliente) e devolve
 * o id do envio. A entrega (`message.delivered`) é conferida depois.
 *
 * Destinos internos usados (rodízio para não repetir o mesmo):
 *   Anezia 5541999601233 · Marilda 5541997675702 · Tatiane 5541998530911
 *
 * GET /backend/v1/diag/apres-4
 */
routerAdd(
  'GET',
  '/backend/v1/diag/apres-4',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, enviados: [], aviso: '' }

    const DESTINOS = ['5541999601233', '5541997675702', '5541998530911']
    // nome para as variáveis do modelo
    const NOME_DEST = ['Anezia', 'Marilda', 'Tatiane']

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
      if (modelo === '') {
        out.enviados.push({ numero: nomeCx, erro: 'sem modelo' })
        continue
      }
      const destino = DESTINOS[idx % DESTINOS.length]
      const nomeDest = NOME_DEST[idx % NOME_DEST.length]
      idx++

      try {
        const env = new Record(colEnv)
        env.set('conexao', cx.id)
        env.set('destino_telefone', destino)
        env.set('motivo', 'teste')
        env.set('modo', 'modelo')
        env.set('modelo_nome', modelo)
        env.set('legenda', nomeDest + '|' + nomeCx.split(' ')[0])
        env.set('texto', 'prova CA-3-114 — ' + nomeCx)
        env.set('estado', 'pendente')
        env.set('tentativas', 0)
        env.set('dedupe_key', 'apres4|' + cx.id + '|' + String(new Date().getTime()))
        env.set('fixture', false)
        app.save(env)
        out.enviados.push({
          numero: nomeCx,
          modelo: modelo,
          destino_interno: destino.slice(-6),
          envio: env.id,
        })
      } catch (e1) {
        out.enviados.push({ numero: nomeCx, erro: String(e1).slice(0, 100) })
      }
    }

    out.aviso = 'na fila; o cron de 2 min envia e o webhook confirma o delivered'
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
