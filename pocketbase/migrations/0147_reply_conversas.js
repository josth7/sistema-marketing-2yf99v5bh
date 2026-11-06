/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0147 — libera `reply_conversas` para quem já responde hoje (CA-3-50).
 *
 * **Por que migração e não na mão:** a ação `reply_conversas` é NOVA. Se eu
 * simplesmente passar a exigi-la, **ninguém mais responde** — as 4 vendedoras
 * que atendem hoje perderiam o botão de enviar de uma vez.
 *
 * **O que esta migração faz:** acrescenta `reply_conversas` ao grant de quem já
 * tem `read_conversas` (as 4 vendedoras e a gestão). Ninguém ganha acesso novo
 * a conversa; ganha só a capacidade de enviar, que já usava.
 *
 * A partir daqui, tirar de alguém é decisão da gestão, pela tela Administração.
 */
migrate(
  (app) => {
    function lerL(raw) {
      try {
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          return JSON.parse(String.fromCharCode.apply(null, raw))
        }
        if (typeof raw === 'string') return JSON.parse(raw)
        return raw || []
      } catch (err) {
        return []
      }
    }

    var atualizados = 0
    var jaTinham = 0
    var grants = []
    try {
      grants = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        "revoked_at=''",
        '',
        400,
        0,
      )
    } catch (e0) {
      console.log('0147: falhou listar grants -> ' + String(e0).slice(0, 140))
      return
    }

    for (const g of grants) {
      const atos = lerL(g.get('actions'))
      if (!Array.isArray(atos)) continue
      // só quem já lê conversa (senão daria leitura de brinde)
      if (atos.indexOf('read_conversas') < 0) continue
      if (atos.indexOf('reply_conversas') >= 0) {
        jaTinham++
        continue
      }
      try {
        const novo = atos.slice()
        novo.push('reply_conversas')
        g.set('actions', JSON.stringify(novo))
        app.save(g)
        atualizados++
      } catch (e1) {
        console.log('0147: falhou grant -> ' + String(e1).slice(0, 120))
      }
    }
    console.log(
      '0147: reply_conversas liberado para ' + atualizados + ' grant(s); ja tinham ' + jaTinham,
    )
  },
  (app) => {
    console.log('0147 revertida (acao permanece)')
  },
)
