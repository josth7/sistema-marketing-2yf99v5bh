/// <reference path="../pb_data/types.d.ts" />
/**
 * VARREDURA DE ÓRFÃOS (10/11) — pedido `concluida` sem dono gravado.
 *
 * **O problema que isto resolve de vez:**
 * Entre 06 e 09/11, o rodízio marcava o pedido como `concluida` mesmo quando o
 * `save` do dono falhava. Esses pedidos ficaram "resolvidos" e **nunca mais**
 * são reprocessados: o cron vê que já existe pedido e não cria outro, e o lead
 * fica órfão para sempre.
 *
 * Resolvi 11 desses na mão em dois dias (24 em 09/11, 5 em 10/11). Isto
 * automatiza: encontra o resíduo e cria pedido novo, deixando o ponto único
 * gravar com a verificação atual.
 *
 * **Segurança:**
 *   - só age em lead **sem dono**;
 *   - só cria pedido se o último pedido dele está `concluida` (resíduo);
 *   - no máximo 30 por rodada, para não afogar a fila;
 *   - registra na trilha cada correção.
 *
 * Cron: a cada 15 minutos.
 */
cronAdd('wa_orfaos', '*/15 * * * *', () => {
  try {
    const app = $app

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

    // ---------- leads sem dono ----------
    var leads = []
    try {
      leads = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '',
        12000,
        0,
      )
    } catch (e0) {
      return
    }

    var corrigidos = 0
    const colTr = app.findCollectionByNameOrId('whatsapp_transferencias')

    for (const l of leads) {
      if (corrigidos >= 30) break
      if (String(l.get('owner_id') || '') !== '') continue
      const st = String(l.get('status') || '')
      if (st === 'descartado') continue

      // já tem pedido pendente? então o fluxo normal vai pegar — não mexo
      var temPendente = false
      var temConcluido = false
      try {
        const trs = app.findRecordsByFilter(colTr, "lead='" + l.id + "'", '', 20, 0)
        for (const t of trs) {
          const est = String(t.get('estado') || '')
          if (est === 'pendente') temPendente = true
          if (est === 'concluida') temConcluido = true
        }
      } catch (e1) {}
      if (temPendente) continue
      // sem pedido nenhum também não é meu caso: o cron do aviso cuida
      if (!temConcluido) continue

      // é resíduo: pedido concluído mas o lead sem dono
      try {
        const tr = new Record(colTr)
        tr.set('lead', l.id)
        tr.set('origem_pedido', 'botao')
        tr.set('motivo', 'primeiro_contato')
        tr.set('simulacao', false)
        tr.set('fixture', false)
        tr.set('detalhe', 'varredura de orfao 10/11')
        app.save(tr)
        corrigidos++
        // trilha
        try {
          const ev = new Record(app.findCollectionByNameOrId('crm_lead_events'))
          ev.set('lead_id', l.id)
          ev.set('tipo', 'status')
          ev.set('texto', 'Lead órfão reprocessado pela varredura (pedido concluído sem dono)')
          ev.set('user_id', '')
          ev.set('fixture', false)
          $app.save(ev)
        } catch (eEv) {}
      } catch (e2) {
        console.log('wa_orfaos: falhou criar pedido -> ' + String(e2).slice(0, 120))
      }
    }

    if (corrigidos > 0) {
      console.log('wa_orfaos: ' + corrigidos + ' orfao(oes) reprocessado(s)')
    }
  } catch (eTop) {
    console.log('wa_orfaos: erro -> ' + String(eTop).slice(0, 140))
  }
})
