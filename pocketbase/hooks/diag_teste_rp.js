/// <reference path="../pb_data/types.d.ts" />
/**
 * VERIFICAÇÃO DO RP-03 / RP-04 (04/11) — leitura, só gestão.
 *
 * A conversa de teste (5541999000099) não aparece na listagem da tela porque
 * ela pagina em 200 e a conversa é a mais nova. Esta rota lê pelo telefone,
 * direto na coleção, e mostra:
 *   - o estado e a etapa da conversa de teste
 *   - as mensagens dela (a resposta do robô entra aqui quando a fila envia)
 *   - os envios da fila com destino a ela
 *
 * É leitura pura: não cria, não altera e não envia nada.
 *
 * GET /backend/v1/diag/teste-rp
 */
routerAdd(
  'GET',
  '/backend/v1/diag/teste-rp',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const TELEFONE = String(e.request.url.query().get('telefone') || '5541999000099')
    const out = {
      ok: true,
      telefone: TELEFONE,
      conversa: null,
      mensagens: [],
      envios: [],
      painel: {},
    }

    // painel (para provar que o robô estava ligado na hora)
    try {
      const vs = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('atendimento_config'),
        '',
        '',
        200,
        0,
      )
      var cfg = null
      for (const v of vs) {
        if (!cfg || Number(v.get('versao') || 0) > Number(cfg.get('versao') || 0)) cfg = v
      }
      if (cfg) {
        out.painel = {
          versao: Number(cfg.get('versao') || 0),
          ligado: cfg.get('ligado') === true,
          janela_min: Number(cfg.get('janela_min') || 0),
        }
      }
    } catch (e0) {}

    // conversa
    var cv = null
    try {
      const a = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_conversas'),
        "contato_telefone='" + TELEFONE + "'",
        '',
        1,
        0,
      )
      if (a && a.length > 0) cv = a[0]
    } catch (e1) {}
    if (!cv) {
      out.ok = false
      out.erro = 'conversa de teste não existe'
      return e.json(200, out)
    }

    out.conversa = {
      id: cv.id,
      estado: String(cv.get('estado') || ''),
      etapa_atual: String(cv.get('etapa_atual') || ''),
      canal: String(cv.get('canal') || ''),
      total_mensagens: cv.get('total_mensagens'),
      ultima_resposta_ia_em: String(cv.get('ultima_resposta_ia_em') || ''),
      fixture: String(cv.get('fixture')) === 'true',
    }

    // mensagens
    var msgs = []
    try {
      msgs = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_mensagens'),
        "contato_telefone='" + TELEFONE + "'",
        '',
        40,
        0,
      )
    } catch (e2) {}
    for (const m of msgs) {
      out.mensagens.push({
        direcao: String(m.get('direcao') || ''),
        autor: String(m.get('autor') || ''),
        status: String(m.get('status') || ''),
        texto: String(m.get('texto') || '').slice(0, 70),
        enviada_em: String(m.get('enviada_em') || '').slice(0, 19),
      })
    }

    // envios da fila com esse destino
    var envs = []
    try {
      envs = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_envios'),
        "destino_telefone='" + TELEFONE + "'",
        '',
        30,
        0,
      )
    } catch (e3) {}
    for (const en of envs) {
      out.envios.push({
        motivo: String(en.get('motivo') || ''),
        estado: String(en.get('estado') || ''),
        texto: String(en.get('texto') || '').slice(0, 70),
        criado: String(en.get('created') || '').slice(0, 19),
        ultimo_erro: String(en.get('ultimo_erro') || ''),
        tentativas: en.get('tentativas'),
      })
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
