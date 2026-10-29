/// <reference path="../pb_data/types.d.ts" />
/**
 * Rota de prova da pausa da IA (CA-3-17) — só em registros de teste.
 *
 * Rota: POST /backend/v1/fixtures/whatsapp/marca-ia
 *   body: { conversa, autor_alvo: 'ia' | 'equipe_central' }
 *
 * Existe para provar as duas metades da regra SEM tocar em cliente real:
 *   - autor `equipe_central` → a conversa tem de ficar `pausada_humano`
 *   - autor `ia`             → NÃO pode pausar
 *
 * A classificação de autoria no webhook (RN-63) casa o `wa_message_id` com a
 * fila `whatsapp_envios`: se o envio foi nosso e o motivo começa com `ia_`,
 * o autor é `ia`. Esta rota cria esse envio e devolve o id para o teste mandar
 * a mensagem com o mesmo id — assim a prova usa o caminho REAL de
 * classificação, não uma simulação.
 *
 * Protegida por X-Fixture-Secret; só toca conversas marcadas `fixture=true`.
 */

routerAdd('POST', '/backend/v1/fixtures/whatsapp/marca-ia', (e) => {
  const segredo = String($secrets.get('FIXTURE_TICK_SECRET') || '')
  const recebido = String(e.request.header.get('X-Fixture-Secret') || '')
  if (segredo === '' || recebido !== segredo) {
    return e.json(403, { ok: false, erro: 'segredo de fixture inválido' })
  }

  const body = e.requestInfo().body || {}
  const conversaId = String(body.conversa || '')
  const motivo = String(body.motivo || 'ia_resposta')

  var conversa = null
  try {
    conversa = $app.findRecordById('whatsapp_conversas', conversaId)
  } catch (eC) {
    return e.json(404, { ok: false, erro: 'conversa_nao_encontrada' })
  }
  if (String(conversa.get('fixture')) !== 'true') {
    return e.json(422, { ok: false, erro: 'conversa_nao_e_fixture' })
  }

  const waId = 'prova-ia-' + String(new Date().getTime())
  const colEnv = $app.findCollectionByNameOrId('whatsapp_envios')
  const env = new Record(colEnv)
  env.set('conexao', String(conversa.get('conexao') || ''))
  env.set('destino_telefone', String(conversa.get('contato_telefone') || ''))
  env.set('motivo', motivo)
  env.set('modo', 'texto')
  env.set('texto', 'resposta da IA (prova)')
  env.set('estado', 'enviado')
  env.set('tentativas', 1)
  env.set('wa_message_id', waId)
  env.set('fixture', true)
  env.set('dedupe_key', waId)
  try {
    $app.save(env)
  } catch (eS) {
    return e.json(500, {
      ok: false,
      erro: 'falha_ao_criar_envio',
      detalhe: String(eS).slice(0, 150),
    })
  }

  return e.json(200, { ok: true, wa_message_id: waId, motivo: motivo, conversa: conversaId })
})
