/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO TEMPORÁRIO (04/11) — o cliente recebeu?
 *
 * O dono afirma que os clientes NÃO recebem. Nossa fila diz `enviado` porque a
 * D-API respondeu 200 — mas 200 só significa "aceitei", não "entreguei".
 *
 * Este diagnóstico olha os TRÊS lugares onde a verdade pode estar:
 *   1. `whatsapp_mensagens.status` — o webhook atualiza para entregue/lida/falhou
 *   2. `whatsapp_envios` — nosso registro (só reflete o POST)
 *   3. a sessão da D-API a que o envio foi atribuído
 *
 * GET /backend/v1/diag/recebimento
 */
routerAdd(
  'GET',
  '/backend/v1/diag/recebimento',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const out = { por_status: {}, msgs: [], envios: [], erro: '' }

    // ---------- 1. mensagens de SAIDA e seus status reais ----------
    var msgs = []
    try {
      msgs = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_mensagens'),
        "direcao='saida'",
        '',
        400,
        0,
      )
    } catch (e0) {
      out.erro = 'mensagens: ' + String(e0).slice(0, 200)
    }
    const cont = {}
    for (const m of msgs) {
      const st = String(m.get('status') || '(vazio)')
      cont[st] = (cont[st] || 0) + 1
    }
    out.por_status = cont

    // as 25 saidas mais recentes com autor ia/sistema
    const ordenadas = msgs.slice().sort(function (a, b) {
      return String(b.get('created') || '').localeCompare(String(a.get('created') || ''))
    })
    for (const m of ordenadas.slice(0, 25)) {
      out.msgs.push({
        created: String(m.get('created') || '').slice(0, 19),
        autor: String(m.get('autor') || ''),
        status: String(m.get('status') || ''),
        destino: String(m.get('contato_telefone') || ''),
        wa_id: String(m.get('wa_message_id') || '').slice(0, 26),
        texto: String(m.get('texto') || '').slice(0, 45),
      })
    }

    // ---------- 2. envios e a sessão usada ----------
    var envs = []
    try {
      envs = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_envios'),
        'fixture=false',
        '',
        60,
        0,
      )
    } catch (e1) {}
    for (const en of envs) {
      const cxId = String(en.get('conexao') || '')
      var sessao = '(sem conexao)'
      var papel = ''
      try {
        const cx = $app.findRecordById('whatsapp_conexoes', cxId)
        sessao = String(cx.get('session_id') || '(vazio)').slice(0, 26)
        papel = String(cx.get('papel') || '')
      } catch (e2) {}
      out.envios.push({
        created: String(en.get('created') || '').slice(0, 19),
        motivo: String(en.get('motivo') || ''),
        estado: String(en.get('estado') || ''),
        destino: String(en.get('destino_telefone') || ''),
        sessao: sessao,
        papel: papel,
        wa_id: String(en.get('wa_message_id') || '').slice(0, 22),
      })
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
