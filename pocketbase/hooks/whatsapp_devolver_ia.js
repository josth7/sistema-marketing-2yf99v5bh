/// <reference path="../pb_data/types.d.ts" />
/**
 * Devolver a conversa para a IA (SPEC-3-005, CA-3-17).
 *
 * Rota: POST /backend/v1/whatsapp/conversas/{id}/devolver-ia
 *
 * O card exige: a resposta de um humano pausa a IA naquela conversa e
 * "Devolver para a IA" retoma. A pausa é gravada pelo webhook (quando a
 * mensagem sai com autor `equipe_central` ou `vendedor`); esta rota é o
 * caminho de volta.
 *
 * Quem pode: quem consegue LER a conversa (RN-71) — gestão com escopo "todos",
 * o vendedor dono do número daquela conexão, ou o responsável pelo lead na
 * central. Ninguém devolve para a IA uma conversa que não pode ler.
 */

routerAdd('POST', '/backend/v1/whatsapp/conversas/{id}/devolver-ia', (e) => {
  const uid = String(e.auth ? e.auth.id : '')
  if (uid === '') return e.json(401, { ok: false, erro: 'sem_sessao' })

  const conversaId = String(e.request.pathValue('id') || '')
  if (conversaId === '') return e.json(400, { ok: false, erro: 'conversa_obrigatoria' })

  var conversa = null
  try {
    conversa = $app.findRecordById('whatsapp_conversas', conversaId)
  } catch (eC) {
    return e.json(404, { ok: false, erro: 'conversa_nao_encontrada' })
  }

  // ---------- pode ler esta conversa? (mesma régua do RN-71) ----------
  var pode = false
  var souGestao = false
  try {
    const colG = $app.findCollectionByNameOrId('access_grants')
    const grants = $app.findRecordsByFilter(
      colG,
      "user_id='" + uid + "' && revoked_at=''",
      '',
      50,
      0,
    )
    const hoje = new Date().toISOString().slice(0, 10)
    for (const g of grants) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
      if (ate !== '' && ate.slice(0, 10) < hoje) continue
      var acts = []
      try {
        const raw = g.get('actions')
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          acts = JSON.parse(String.fromCharCode.apply(null, raw))
        } else if (typeof raw === 'string') {
          acts = JSON.parse(raw)
        } else {
          acts = raw || []
        }
      } catch (eA) {}
      if (!Array.isArray(acts) || acts.indexOf('read_conversas') < 0) continue
      var sa = []
      try {
        const rawS = g.get('scope_accounts')
        if (Array.isArray(rawS) && rawS.length > 0 && typeof rawS[0] === 'number') {
          sa = JSON.parse(String.fromCharCode.apply(null, rawS))
        } else if (typeof rawS === 'string') {
          sa = JSON.parse(rawS)
        } else {
          sa = rawS || []
        }
      } catch (eS) {}
      if (Array.isArray(sa) && sa.indexOf('*') >= 0) {
        pode = true
        souGestao = true
      }
    }
  } catch (eGr) {}

  if (!pode) {
    // vendedor dono do número desta conversa
    try {
      const cx = $app.findRecordById('whatsapp_conexoes', String(conversa.get('conexao')))
      if (
        String(cx.get('papel') || '') === 'vendedor' &&
        String(cx.get('vendedor_user') || '') === uid
      ) {
        pode = true
      }
      // central: responsável pelo lead
      if (!pode && String(cx.get('papel') || '') === 'central') {
        const lid = String(conversa.get('lead') || '')
        if (lid !== '') {
          const l = $app.findRecordById('crm_leads', lid)
          if (String(l.get('owner_id') || '') === uid) pode = true
        }
      }
    } catch (eP) {}
  }
  if (!pode) return e.json(403, { ok: false, erro: 'sem_acesso_a_conversa' })

  // ---------- devolve para a IA ----------
  const estadoAntes = String(conversa.get('estado') || '')
  conversa.set('estado', 'triagem')
  conversa.set('pausada_motivo', '')
  conversa.set('pausada_ate', '')
  conversa.set('retomada_em', new Date().toISOString())
  try {
    $app.save(conversa)
  } catch (eS2) {
    return e.json(500, { ok: false, erro: 'falha_ao_salvar', detalhe: String(eS2).slice(0, 120) })
  }

  // trilha: quem devolveu
  try {
    const colEv = $app.findCollectionByNameOrId('whatsapp_eventos')
    const ev = new Record(colEv)
    ev.set('evento', 'conversa.devolvida_ia')
    ev.set('conexao', String(conversa.get('conexao') || ''))
    ev.set('dedupe_key', 'devolver_ia|' + conversaId + '|' + String(new Date().getTime()))
    ev.set('resultado', 'ok')
    $app.save(ev)
  } catch (eEv) {}

  return e.json(200, {
    ok: true,
    conversa: conversaId,
    estado_anterior: estadoAntes,
    estado: 'triagem',
    quem: String(uid),
  })
})
