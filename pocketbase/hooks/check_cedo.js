/// <reference path="../pb_data/types.d.ts" />
/**
 * POR QUE A TRANSFERÊNCIA VEIO ANTES DO MENU? (11/11).
 *
 * Teste do 554184365165:
 *   16:31:28 cliente: "Olá! Vi o anúncio da Haisan no google"
 *   16:32:00 IA: boas-vindas (E1)
 *   16:35:02 aviso: "Quem vai te atender é Fábio"   ← 3 min depois, SEM esperar
 *   16:36:31 cliente: "2"                            ← resposta ao menu que nunca veio
 *
 * O robô mandou E1 e, 3 minutos depois, transferiu sem esperar o cliente
 * escolher o menu. O cron `wa_distribuicao_abertura`? Não — é outro caminho.
 *
 * Aqui se mostra: quem criou o pedido de transferência e quando.
 *
 * GET /backend/v1/check/transferencia-cedo
 */
routerAdd(
  'GET',
  '/backend/v1/check/transferencia-cedo',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, pedidos: [], envios: [] }

    // pedidos de transferência dos telefones de teste
    const TELS = ['554184365165', '554189036170']
    try {
      const leads = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        "telefone='554184365165' || telefone='554189036170'",
        '',
        20,
        0,
      )
      for (const l of leads) {
        const trs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_transferencias'),
          "lead='" + l.id + "'",
          '',
          10,
          0,
        )
        for (const t of trs) {
          var vendedor = ''
          try {
            vendedor = String(
              app.findRecordById('users', String(t.get('vendedor_user'))).get('name') || '',
            )
          } catch (eV) {}
          out.pedidos.push({
            lead: String(l.get('nome') || '').slice(0, 16),
            quando: String(t.get('created') || '').slice(11, 19),
            estado: String(t.get('estado') || ''),
            regra: String(t.get('regra') || ''),
            detalhe: String(t.get('detalhe') || '').slice(0, 40),
            vendedor: vendedor,
          })
        }
      }
    } catch (e1) {
      out.erro = String(e1).slice(0, 120)
    }

    // a regra do roteiro: em que etapa está a conversa?
    const CVS = ['554184365165', '554189036170']
    for (const tel of CVS) {
      try {
        const cvs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_conversas'),
          "contato_telefone='" + tel + "' && conexao!=''",
          '',
          5,
          0,
        )
        for (const c of cvs) {
          var papel = ''
          try {
            papel = String(
              app.findRecordById('whatsapp_conexoes', String(c.get('conexao'))).get('papel') || '',
            )
          } catch (eP) {}
          if (papel !== 'central') continue
          out.envios.push({
            tel: tel,
            etapa: String(c.get('roteiro_etapa') || '(sem campo)'),
            estado: String(c.get('estado') || ''),
            total: Number(c.get('total_mensagens') || 0),
          })
        }
      } catch (e2) {}
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
