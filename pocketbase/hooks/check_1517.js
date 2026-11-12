/// <reference path="../pb_data/types.d.ts" />
/**
 * O QUE ACONTECEU COM O TESTE DAS 15:17? (12/11)
 *
 * O dono mandou do 4198903-6170 e nao teve retorno. Aqui se mostra, em ordem:
 *   - a mensagem chegou? em qual conexao?
 *   - a conversa da central estava em que estado?
 *   - o robo rodou? o que ele decidiu?
 *   - houve envio da IA? em que estado ficou?
 *
 * GET /backend/v1/check/teste-1517
 */
routerAdd(
  'GET',
  '/backend/v1/check/teste-1517',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, conversas: [], mensagens: [], envios: [], agora_utc: '' }

    out.agora_utc = new Date().toISOString().slice(0, 19)

    const TELS = ['554189036170', '4189036170']

    const nomesCx = {}
    const papelCx = {}
    try {
      for (const c of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        '',
        '',
        60,
        0,
      )) {
        nomesCx[c.id] = String(c.get('nome_exibicao') || '')
        papelCx[c.id] = String(c.get('papel') || '')
      }
    } catch (e0) {}

    // 1. as conversas desse numero
    for (const tel of TELS) {
      try {
        const cvs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_conversas'),
          "contato_telefone='" + tel + "'",
          '',
          10,
          0,
        )
        for (const c of cvs) {
          const cx = String(c.get('conexao') || '')
          out.conversas.push({
            tel: tel,
            conexao: nomesCx[cx] || '',
            papel: papelCx[cx] || '',
            estado: String(c.get('estado') || ''),
            msgs: Number(c.get('total_mensagens') || 0),
            ultimo_autor: String(c.get('ultimo_autor') || ''),
            ultima_ia: String(c.get('ultima_resposta_ia_em') || '').slice(0, 19),
            ultima_msg: String(c.get('ultima_mensagem_em') || '').slice(0, 19),
            criada: String(c.get('created') || '').slice(0, 19),
            pausada_motivo: String(c.get('pausada_motivo') || '').slice(0, 50),
          })
        }
      } catch (e1) {}
    }

    // 2. as mensagens de hoje desse numero (qualquer conexao)
    try {
      const msgs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "created>='2026-11-12 17:00'",
        '',
        300,
        0,
      )
      for (const m of msgs) {
        const t = String(m.get('contato_telefone') || '')
        if (t.indexOf('9036170') < 0) continue
        out.mensagens.push({
          tel: t.slice(-6),
          q: String(m.get('created') || '').slice(11, 19),
          dir: String(m.get('direcao') || ''),
          autor: String(m.get('autor') || ''),
          status: String(m.get('status') || ''),
          texto: String(m.get('texto') || '').slice(0, 60),
        })
      }
      out.mensagens.sort(function (a, b) {
        return a.q < b.q ? -1 : 1
      })
    } catch (e2) {}

    // 3. os envios para esse numero hoje
    try {
      const envs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_envios'),
        "destino_telefone='554189036170' && created>='2026-11-12 17:00'",
        '',
        50,
        0,
      )
      for (const en of envs) {
        out.envios.push({
          q: String(en.get('created') || '').slice(11, 19),
          motivo: String(en.get('motivo') || ''),
          estado: String(en.get('estado') || ''),
          erro: String(en.get('ultimo_erro') || '').slice(0, 60),
          texto: String(en.get('texto') || '').slice(0, 50),
        })
      }
    } catch (e3) {}

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
