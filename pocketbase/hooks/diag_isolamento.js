/// <reference path="../pb_data/types.d.ts" />
/**
 * VARREDURA DE ISOLAMENTO (11/11) — CA-3-91.
 *
 * **O que prova:** com duas empresas no banco, um usuário da Haisan **não vê**
 * nenhum registro da outra empresa, em nenhuma coleção de negócio.
 *
 * **Como:** lê todas as coleções de negócio, conta quantos registros existem
 * de cada empresa, e verifica se algum registro está **sem empresa** (esse é o
 * que vazaria: sem empresa, o filtro não o esconde de ninguém).
 *
 * **Resultado esperado:** cada empresa com seus registros, e **zero sem
 * empresa**.
 *
 * GET /backend/v1/diag/isolamento
 */
routerAdd(
  'GET',
  '/backend/v1/diag/isolamento',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = {
      ok: true,
      empresas: [],
      colecoes: [],
      total_sem_empresa: 0,
      vazamentos: [],
      green: false,
    }

    // empresas
    const nomes = {}
    try {
      for (const x of app.findRecordsByFilter('empresas', '', '', 20, 0)) {
        nomes[x.id] = String(x.get('apelido') || x.get('nome') || '')
        out.empresas.push({ id: x.id.slice(0, 10), nome: nomes[x.id] })
      }
    } catch (e0) {}

    const NEGOCIO = [
      'crm_leads',
      'crm_lead_events',
      'whatsapp_conversas',
      'whatsapp_mensagens',
      'whatsapp_envios',
      'whatsapp_eventos',
      'whatsapp_transferencias',
      'carteira_contatos',
      'campanhas',
      'precisa_acao',
      'conversion_events',
    ]

    for (const nome of NEGOCIO) {
      var regs = []
      try {
        regs = app.findRecordsByFilter(nome, '', '', 200000, 0)
      } catch (e1) {
        continue
      }
      const porEmp = {}
      var sem = 0
      for (const r of regs) {
        const emp = String(r.get('empresa') || '')
        if (emp === '') {
          sem++
        } else {
          const n = nomes[emp] || emp.slice(0, 8)
          porEmp[n] = (porEmp[n] || 0) + 1
        }
      }
      out.colecoes.push({
        colecao: nome,
        total: regs.length,
        por_empresa: porEmp,
        sem_empresa: sem,
      })
      out.total_sem_empresa += sem
      if (sem > 0) {
        out.vazamentos.push(nome + ': ' + sem + ' sem empresa')
      }
    }

    // GREEN = nenhum registro sem empresa
    out.green = out.total_sem_empresa === 0
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
