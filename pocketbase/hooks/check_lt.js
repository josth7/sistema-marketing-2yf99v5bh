/// <reference path="../pb_data/types.d.ts" />
/**
 * LIMPEZA DAS CONVERSAS ANTIGAS EM TRIAGEM (12/11).
 *
 * **O problema:** 77 conversas em `triagem` na central, com 19 a 352 horas.
 * Elas estão fora da janela de 12h do robô — ele **nunca** vai agir nelas. Mas
 * aparecem na tela como "esperando", e número irreal faz o time desconfiar.
 *
 * **Critério da limpeza (conservador):**
 *   - só conversa da CENTRAL em `triagem`
 *   - última mensagem há mais de **7 dias** (168h) → lixo claro
 *   - marca `resolvida_em` e tira de `triagem` (estado `pausada_humano` com
 *     motivo "encerrada por inatividade")
 *
 * **NÃO toca em:** conversa com menos de 7 dias, de vendedor, transferida ou já
 * pausada. Essas podem ser trabalho real.
 *
 * `?executar=1` aplica. Sem isso, só mostra o que faria.
 *
 * GET /backend/v1/check/limpa-triagem
 */
routerAdd(
  'GET',
  '/backend/v1/check/limpa-triagem',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const executar = String(e.request.url.query().get('executar') || '') === '1'
    const out = { ok: true, executar: executar, faixas: {}, encerradas: 0, mantidas: 0 }

    // central
    var central = null
    try {
      const cs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='central' && ativo=true && fixture=false",
        '',
        1,
        0,
      )
      if (cs.length > 0) central = cs[0]
    } catch (e0) {}
    if (!central) return e.json(200, { ok: false, erro: 'sem central' })

    var cvs = []
    try {
      cvs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "conexao='" + central.id + "' && estado='triagem'",
        '',
        3000,
        0,
      )
    } catch (e1) {
      return e.json(200, { ok: false, erro: String(e1).slice(0, 120) })
    }

    const agora = new Date().getTime()
    const LIMITE_H = 168 // 7 dias

    for (const c of cvs) {
      const q = new Date(String(c.get('ultima_mensagem_em') || c.get('created') || '')).getTime()
      const horas = q > 0 ? (agora - q) / 3600000 : 9999
      // faixa para o relatório
      var faixa = ''
      if (horas > 720) faixa = 'mais de 30 dias'
      else if (horas > 168) faixa = '7 a 30 dias'
      else if (horas > 24) faixa = '1 a 7 dias'
      else faixa = 'menos de 24h'
      out.faixas[faixa] = (out.faixas[faixa] || 0) + 1

      if (horas <= LIMITE_H) {
        out.mantidas++
        continue
      }

      if (executar) {
        try {
          c.set('estado', 'pausada_humano')
          c.set('pausada_motivo', 'encerrada por inatividade (mais de 7 dias em triagem)')
          c.set('pausada_em', new Date().toISOString())
          c.set('resolvida_em', new Date().toISOString())
          app.save(c)
          out.encerradas++
        } catch (e2) {}
      } else {
        out.encerradas++
      }
    }

    out.total_triagem = cvs.length
    out.aviso = executar
      ? 'aplicado: conversas com mais de 7 dias saíram de triagem'
      : 'simulação — chame com ?executar=1 para aplicar'

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
