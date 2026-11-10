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

      // ---------- RN-193 (10/11): volta para o VENDEDOR ANUNCIADO ----------
      // Se o cliente já ouviu o nome de um vendedor (a central ou o robô
      // anunciou), ele é o dono. O lead órfão volta para ELE — nunca para o
      // rodízio escolher outro. Foi o caso da Sabrina (10/11): a central disse
      // "Adriana" e o lead apareceu com a Elisângela.
      var anunciado = ''
      try {
        const trsV = app.findRecordsByFilter(colTr, "lead='" + l.id + "'", '', 20, 0)
        for (const tv of trsV) {
          const vv = String(tv.get('vendedor_user') || '')
          if (vv !== '') anunciado = vv
        }
      } catch (eV) {}

      if (anunciado !== '') {
        // devolve direto ao anunciado, sem passar pelo rodízio
        try {
          const lf = app.findRecordById('crm_leads', l.id)
          lf.set('owner_id', anunciado)
          app.save(lf)
          const conf = app.findRecordById('crm_leads', l.id)
          if (String(conf.get('owner_id') || '') === anunciado) {
            corrigidos++
            try {
              const evA = new Record(app.findCollectionByNameOrId('crm_lead_events'))
              evA.set('lead_id', l.id)
              evA.set('tipo', 'status')
              evA.set('texto', 'Lead órfão devolvido ao vendedor anunciado ao cliente (RN-193)')
              evA.set('user_id', '')
              evA.set('fixture', false)
              $app.save(evA)
            } catch (eEvA) {}
            continue
          }
        } catch (eDev) {}
      }

      // sem anúncio registrado: pedido novo pelo rodízio (comportamento antigo)
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
