/// <reference path="../pb_data/types.d.ts" />
/**
 * FILA OPERACIONAL — o que ainda depende do sistema (17/11).
 *
 * Junta num lugar só o que ficou pendente das correções de hoje:
 *   1. leads com dono que NÃO é vendedor ativo (devem ir a Precisa de ação);
 *   2. leads sem dono;
 *   3. conversas sem lead vinculado;
 *   4. itens abertos em Precisa de ação;
 *   5. transferências em estado de erro/duplicada de hoje.
 *
 * Só leitura.
 *
 * GET /backend/v1/check/fila-operacional
 */
routerAdd(
  'GET',
  '/backend/v1/check/fila-operacional',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true }

    // vendedores ativos
    const ativos = {}
    try {
      for (const c of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='vendedor' && ativo=true && fixture=false",
        '',
        30,
        0,
      )) {
        const uid = String(c.get('vendedor_user') || '')
        if (uid !== '') ativos[uid] = String(c.get('nome_exibicao') || '')
      }
    } catch (e0) {}
    out.vendedores_ativos = Object.keys(ativos).length

    function nomeDe(uid) {
      try {
        const u = app.findRecordById('users', uid)
        const n = String(u.get('name') || '')
        return n !== '' ? n : '(' + String(u.get('email') || '?') + ')'
      } catch (eU) {
        return '(apagado)'
      }
    }

    // 1 + 2. leads
    var leads = []
    try {
      leads = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '-created',
        6000,
        0,
      )
    } catch (e1) {}

    const invalidos = []
    const semDono = []
    for (const l of leads) {
      const ow = String(l.get('owner_id') || '')
      const st = String(l.get('status') || '')
      if (st === 'descartado' || st === 'finalizado' || st === 'venda_realizada') continue
      if (ow === '') {
        semDono.push({
          lead: l.id.slice(0, 10),
          nome: String(l.get('nome') || '').slice(0, 24),
          tel: String(l.get('telefone') || '').slice(-6),
          criado: String(l.get('created') || '').slice(0, 16),
        })
        continue
      }
      if (ativos[ow] === undefined) {
        invalidos.push({
          lead: l.id.slice(0, 10),
          nome: String(l.get('nome') || '').slice(0, 24),
          tel: String(l.get('telefone') || '').slice(-6),
          dono: nomeDe(ow),
          status: st,
          criado: String(l.get('created') || '').slice(0, 16),
        })
      }
    }
    out.leads_com_dono_invalido = invalidos
    out.leads_sem_dono = semDono

    // 3. conversas sem lead
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
    } catch (e2) {}

    out.conversas_sem_lead = []
    if (central) {
      try {
        const cvs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_conversas'),
          "conexao='" + central.id + "' && fixture=false && lead=''",
          '-created',
          600,
          0,
        )
        for (const cv of cvs) {
          if (out.conversas_sem_lead.length >= 40) break
          out.conversas_sem_lead.push({
            conversa: cv.id.slice(0, 10),
            tel: String(cv.get('contato_telefone') || '').slice(-6),
            estado: String(cv.get('estado') || ''),
            etapa: String(cv.get('etapa_atual') || ''),
            msgs: Number(cv.get('total_mensagens') || 0),
            criada: String(cv.get('created') || '').slice(0, 16),
          })
        }
      } catch (e3) {}
    }

    // 4. Precisa de ação aberto
    out.precisa_acao = []
    try {
      const pas = app.findRecordsByFilter(
        app.findCollectionByNameOrId('precisa_acao'),
        'resolvido=false',
        '-created',
        100,
        0,
      )
      for (const p of pas) {
        out.precisa_acao.push({
          id: p.id.slice(0, 10),
          tipo: String(p.get('tipo') || ''),
          motivo: String(p.get('motivo') || '').slice(0, 80),
          lead: String(p.get('lead_id') || '').slice(0, 10),
          criado: String(p.get('created') || '').slice(0, 16),
        })
      }
    } catch (e4) {}

    // 5. transferências de hoje por estado
    out.transferencias_hoje = {}
    try {
      const trs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_transferencias'),
        "created>='2026-11-17 00:00'",
        '',
        300,
        0,
      )
      for (const t of trs) {
        const est = String(t.get('estado') || '(vazio)')
        out.transferencias_hoje[est] = (out.transferencias_hoje[est] || 0) + 1
      }
    } catch (e5) {}

    out.resumo = {
      leads_dono_invalido: invalidos.length,
      leads_sem_dono: semDono.length,
      conversas_sem_lead: out.conversas_sem_lead.length,
      precisa_acao: out.precisa_acao.length,
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
