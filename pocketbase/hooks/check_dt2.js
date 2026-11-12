/// <reference path="../pb_data/types.d.ts" />
/**
 * DESFAZ O LIXO DO TESTE DA IMPORTACAO (12/11).
 *
 * O teste do CA-3-76 deixou dado falso no CRM:
 *   - 3 leads CRIADOS ("Novo A/B/C") com telefone inventado;
 *   - 5 leads REAIS marcados como venda com valor que nao existiu.
 *
 * Sem isso, o relatorio por vendedor mostra venda que nao aconteceu.
 *
 * `?executar=1` aplica. Sem isso, so lista.
 *
 * GET /backend/v1/check/desfaz-teste
 */
routerAdd(
  'GET',
  '/backend/v1/check/desfaz-teste',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const executar = String(e.request.url.query().get('executar') || '') === '1'
    const out = { ok: true, executar: executar, apagados: 0, revertidos: 0, itens: [] }

    // ---------- 1. apaga os leads criados pelo teste ----------
    // telefones inventados no CSV de teste
    const INVENTADOS = ['5541955551111', '5541944442222', '5541933333333']
    for (const tel of INVENTADOS) {
      try {
        const ls = app.findRecordsByFilter(
          app.findCollectionByNameOrId('crm_leads'),
          "telefone='" + tel + "'",
          '',
          5,
          0,
        )
        for (const l of ls) {
          out.itens.push({
            acao: 'apagar lead de teste',
            nome: String(l.get('nome') || ''),
            tel: tel,
          })
          if (executar) {
            try {
              app.delete(l)
              out.apagados++
            } catch (eD) {}
          } else {
            out.apagados++
          }
        }
      } catch (e0) {}
    }

    // ---------- 2. reverte os leads reais marcados como venda ----------
    const REAIS = ['558899898584', '554791500408', '554398116797', '553196123601', '5511945894103']
    for (const tel of REAIS) {
      try {
        const ls = app.findRecordsByFilter(
          app.findCollectionByNameOrId('crm_leads'),
          "telefone='" + tel + "'",
          '',
          5,
          0,
        )
        for (const l of ls) {
          if (String(l.get('status') || '') !== 'venda_realizada') continue
          out.itens.push({
            acao: 'reverter venda de teste',
            nome: String(l.get('nome') || ''),
            tel: tel,
            valor_atual: l.get('valor'),
          })
          if (executar) {
            try {
              l.set('status', 'entrada_lead')
              l.set('valor', 0)
              try {
                l.set('venda_em', '')
              } catch (eV) {}
              app.save(l)
              out.revertidos++
            } catch (eR) {}
          } else {
            out.revertidos++
          }
        }
      } catch (e1) {}
    }

    out.aviso = executar ? 'aplicado' : 'simulacao — chame com ?executar=1'
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
