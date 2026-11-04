/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO TEMPORÁRIO (04/11) — de onde veio a mensagem "assistente virtual"
 * que saiu em 30/10 20:58 na conversa da Nillma.
 *
 * Eu afirmei ao dono que era "automação externa na D-API". Ele respondeu que
 * nunca configurou automação nenhuma. O texto, porém, é IDÊNTICO ao do nosso
 * motor. Então a pergunta certa é: saiu da NOSSA fila de envios?
 *
 * Esta rota responde isso e some.
 *
 * GET /backend/v1/diag/envios
 */
routerAdd(
  'GET',
  '/backend/v1/diag/envios',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const out = { envios: [], total_envios: 0, por_motivo: {}, faixa: '' }

    var envios = []
    try {
      envios = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_envios'),
        "created>='2026-10-30 19:00:00' && created<='2026-10-31 02:00:00'",
        '',
        200,
        0,
      )
    } catch (e0) {
      // tenta sem filtro de data (campos podem ser datetime com outro formato)
      try {
        envios = $app.findRecordsByFilter(
          $app.findCollectionByNameOrId('whatsapp_envios'),
          '',
          '',
          300,
          0,
        )
      } catch (e1) {
        return e.json(200, { ok: false, erro: String(e1).slice(0, 200) })
      }
    }

    out.total_envios = envios.length
    const motivos = {}
    for (const en of envios) {
      const m = String(en.get('motivo') || '(vazio)')
      motivos[m] = (motivos[m] || 0) + 1
      const criado = String(en.get('created') || '')
      if (criado.indexOf('2026-10-30 2') < 0 && criado.indexOf('2026-10-30 1') < 0) continue
      out.envios.push({
        id: en.id,
        created: criado.slice(0, 19),
        motivo: m,
        destino: String(en.get('destino_telefone') || ''),
        estado: String(en.get('estado') || ''),
        wa_message_id: String(en.get('wa_message_id') || '').slice(0, 40),
        texto: String(en.get('texto') || '').slice(0, 80),
      })
    }
    out.por_motivo = motivos

    // alguma mensagem gravada tem wa_message_id que casa com envio?
    var msgs = []
    try {
      msgs = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_mensagens'),
        "contato_telefone='554191020487'",
        '',
        50,
        0,
      )
    } catch (e2) {}
    out.msgs_nillma = []
    for (const m of msgs) {
      out.msgs_nillma.push({
        autor: String(m.get('autor') || ''),
        wa_id: String(m.get('wa_message_id') || '').slice(0, 40),
        enviada: String(m.get('enviada_em') || '').slice(0, 19),
        texto: String(m.get('texto') || '').slice(0, 40),
      })
    }

    // data/hora do servidor, para conferir fuso
    out.agora = new Date().toISOString()
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
