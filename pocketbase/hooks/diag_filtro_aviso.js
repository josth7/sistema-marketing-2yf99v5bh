/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (10/11) — o filtro do aviso ao vendedor acha as mensagens?
 *
 * Roda o MESMO filtro do cron `wa_aviso_resposta`, passo a passo, e mostra
 * em qual etapa as mensagens caem. Só leitura.
 *
 * GET /backend/v1/diag/filtro-aviso
 */
routerAdd(
  'GET',
  '/backend/v1/diag/filtro-aviso',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = {
      ok: true,
      total_msgs: 0,
      da_central: 0,
      dentro_2h: 0,
      com_lead: 0,
      lead_com_dono: 0,
      nao_triagem: 0,
      exemplos: [],
      erro: '',
    }

    const cxPapel = {}
    try {
      for (const c of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        'ativo=true',
        '',
        60,
        0,
      )) {
        cxPapel[c.id] = String(c.get('papel') || '')
      }
    } catch (e0) {
      out.erro = 'conexoes: ' + String(e0).slice(0, 100)
    }

    var msgs = []
    try {
      const desde = new Date(new Date().getTime() - 6 * 3600000)
        .toISOString()
        .replace('T', ' ')
        .slice(0, 19)
      msgs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "direcao='entrada' && created>='" + desde + "'",
        '',
        3000,
        0,
      )
    } catch (e1) {
      out.erro += ' msgs: ' + String(e1).slice(0, 120)
      // mostra a mensagem MAIS RECENTE da central (para saber a janela real)
      var maisRecente = 0
      for (const m of msgs) {
        const cx = String(m.get('conexao') || '')
        if (cxPapel[cx] !== 'central') continue
        var qq = new Date(String(m.get('enviada_em') || '')).getTime()
        if (!(qq > 0)) qq = new Date(String(m.get('created') || '')).getTime()
        if (qq > maisRecente) maisRecente = qq
      }
      out.mais_recente_central_horas =
        maisRecente > 0 ? Math.round((agora - maisRecente) / 3600000) : -1

      return e.json(200, out)
    }
    out.total_msgs = msgs.length

    const agora = new Date().getTime()
    for (const m of msgs) {
      const cx = String(m.get('conexao') || '')
      if (cxPapel[cx] !== 'central') continue
      out.da_central++

      var q = new Date(String(m.get('enviada_em') || '')).getTime()
      if (!(q > 0)) q = new Date(String(m.get('created') || '')).getTime()
      if (!(q > 0)) continue
      const horas = Math.round((agora - q) / 3600000)
      if (agora - q > 6 * 3600000) continue
      out.dentro_2h++

      const tel = String(m.get('contato_telefone') || '').replace(/[^0-9]/g, '')
      if (tel === '') continue

      var lead = null
      try {
        const ls = app.findRecordsByFilter(
          app.findCollectionByNameOrId('crm_leads'),
          "telefone='" + tel + "' && fixture=false",
          '',
          1,
          0,
        )
        if (ls && ls.length > 0) lead = ls[0]
      } catch (e2) {}
      if (!lead) continue
      out.com_lead++

      const dono = String(lead.get('owner_id') || '')
      if (dono === '') continue
      out.lead_com_dono++

      // a conversa está em triagem (IA atendendo)?
      var est = ''
      try {
        const cvs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_conversas'),
          "conexao='" + cx + "' && contato_telefone='" + tel + "'",
          '',
          1,
          0,
        )
        if (cvs && cvs.length > 0) est = String(cvs[0].get('estado') || '')
      } catch (e3) {}
      if (est === 'triagem') continue
      out.nao_triagem++

      if (out.exemplos.length < 8) {
        out.exemplos.push({
          tel: tel.slice(-6),
          horas: horas,
          estado_conversa: est || '(sem conversa)',
          dono: dono.slice(0, 8),
        })
      }
    }

    // mostra a mensagem MAIS RECENTE da central (para saber a janela real)
    var maisRecente = 0
    for (const m of msgs) {
      const cx = String(m.get('conexao') || '')
      if (cxPapel[cx] !== 'central') continue
      var qq = new Date(String(m.get('enviada_em') || '')).getTime()
      if (!(qq > 0)) qq = new Date(String(m.get('created') || '')).getTime()
      if (qq > maisRecente) maisRecente = qq
    }
    out.mais_recente_central_horas =
      maisRecente > 0 ? Math.round((agora - maisRecente) / 3600000) : -1

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
