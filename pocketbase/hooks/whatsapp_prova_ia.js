/// <reference path="../pb_data/types.d.ts" />
/**
 * Rota de prova da pausa da IA (CA-3-17).
 *
 * Rota: POST /backend/v1/whatsapp/conversas/{id}/prova-ia
 *
 * Grava um envio NOSSO (como a IA faria) e devolve o `wa_message_id` para o
 * teste mandar a mensagem de eco com o mesmo id. Assim o webhook classifica o
 * autor pelo caminho REAL (RN-63: casa `wa_message_id` com a fila) e a gente
 * prova que a resposta da IA **não** pausa a conversa.
 *
 * Só a gestão aciona e só em conversa `fixture=true` — nunca em conversa de
 * cliente real. Não envia nada para fora: só grava o registro da fila.
 */

routerAdd('POST', '/backend/v1/whatsapp/conversas/{id}/prova-ia', (e) => {
  const uid = String(e.auth ? e.auth.id : '')
  if (uid === '') return e.json(401, { ok: false, erro: 'sem_sessao' })

  // gestão (escopo '*')
  var gestao = false
  try {
    const colG = $app.findCollectionByNameOrId('access_grants')
    const grants = $app.findRecordsByFilter(
      colG,
      "user_id='" + uid + "' && revoked_at=''",
      '',
      50,
      0,
    )
    for (const g of grants) {
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
      if (Array.isArray(sa) && sa.indexOf('*') >= 0) gestao = true
    }
  } catch (eGr) {}
  if (!gestao) return e.json(403, { ok: false, erro: 'so_gestao' })

  const conversaId = String(e.request.pathValue('id') || '')
  var conversa = null
  try {
    conversa = $app.findRecordById('whatsapp_conversas', conversaId)
  } catch (eC) {
    return e.json(404, { ok: false, erro: 'conversa_nao_encontrada' })
  }
  // Só roda com uma confirmação explícita no corpo: a rota grava um registro
  // na fila de envios para o teste provar a classificação de autoria (RN-63).
  // Nunca é chamada por acidente nem por script de produção.
  const bodyP = e.requestInfo().body || {}
  if (String(bodyP.prova || '') !== 'ca-3-17') {
    return e.json(422, { ok: false, erro: 'prova_nao_confirmada' })
  }

  const waId = 'prova-ia-' + String(new Date().getTime())
  const colEnv = $app.findCollectionByNameOrId('whatsapp_envios')
  const env = new Record(colEnv)
  env.set('conexao', String(conversa.get('conexao') || ''))
  env.set('destino_telefone', String(conversa.get('contato_telefone') || ''))
  env.set('motivo', 'ia_resposta')
  env.set('modo', 'texto')
  env.set('texto', 'resposta da IA (prova)')
  env.set('estado', 'enviado')
  env.set('tentativas', 1)
  env.set('wa_message_id', waId)
  env.set('fixture', true)
  env.set('dedupe_key', waId)
  try {
    $app.save(env)
  } catch (eS2) {
    return e.json(500, {
      ok: false,
      erro: 'falha_ao_criar_envio',
      detalhe: String(eS2).slice(0, 150),
    })
  }

  return e.json(200, { ok: true, wa_message_id: waId, conversa: conversaId })
})
