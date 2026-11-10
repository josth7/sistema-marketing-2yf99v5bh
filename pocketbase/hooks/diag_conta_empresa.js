/// <reference path="../pb_data/types.d.ts" />
/**
 * CONTAGEM DO CA-3-87 (10/11) — quantos registros têm empresa?
 *
 * A SPEC pede "contagem antes e depois": todo registro de negócio precisa ter
 * `empresa` preenchida com a Haisan.
 *
 * GET /backend/v1/diag/conta-empresa
 */
routerAdd(
  'GET',
  '/backend/v1/diag/conta-empresa',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = {
      ok: true,
      total: 0,
      com_empresa: 0,
      sem_empresa: 0,
      por_colecao: [],
      faltando: [],
    }

    // a empresa Haisan existe?
    var idHaisan = ''
    try {
      const es = app.findRecordsByFilter('empresas', '', '', 5, 0)
      for (const x of es) {
        out.empresa = String(x.get('nome') || '')
        idHaisan = x.id
      }
    } catch (e0) {
      out.erro = String(e0).slice(0, 120)
    }

    const ALVOS = [
      'crm_leads',
      'crm_lead_events',
      'conversion_events',
      'whatsapp_conexoes',
      'whatsapp_conversas',
      'whatsapp_mensagens',
      'whatsapp_envios',
      'whatsapp_eventos',
      'whatsapp_transferencias',
      'carteira_contatos',
      'campanhas',
      'precisa_acao',
      'admin_config',
      'access_grants',
      'atendimento_config',
    ]

    for (const nome of ALVOS) {
      var regs = []
      try {
        regs = app.findRecordsByFilter(nome, '', '', 200000, 0)
      } catch (e1) {
        continue
      }
      var com = 0
      var sem = 0
      for (const r of regs) {
        if (String(r.get('empresa') || '') !== '') com++
        else sem++
      }
      out.total += regs.length
      out.com_empresa += com
      out.sem_empresa += sem
      out.por_colecao.push({ col: nome, total: regs.length, com: com, sem: sem })
      if (sem > 0 && out.faltando.length < 15) out.faltando.push(nome + ':' + sem)
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
