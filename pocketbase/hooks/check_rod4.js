/// <reference path="../pb_data/types.d.ts" />
/**
 * A transferência com `rodrigo@adapta.org` no nome do vendedor (17/11).
 *
 * Achada: 2026-11-05 16:35, estado `sem_numero`, motivo `fora_do_roteiro`,
 * lead `xute55kmx5`. Aqui se mostra:
 *   - o lead inteiro (dono, status, telefone, origem);
 *   - a conversa correspondente;
 *   - as mensagens trocadas;
 *   - se o cliente chegou a ser avisado de quem o atenderia.
 *
 * GET /backend/v1/check/rodrigo-caso
 */
routerAdd(
  'GET',
  '/backend/v1/check/rodrigo-caso',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true }

    // a transferência
    var tr = null
    try {
      const trs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_transferencias'),
        "vendedor_nome='rodrigo@adapta.org'",
        '-created',
        5,
        0,
      )
      if (trs.length > 0) tr = trs[0]
    } catch (e0) {}
    if (!tr) return e.json(200, { ok: false, erro: 'transferencia nao encontrada' })

    const leadId = String(tr.get('lead') || '')
    out.transferencia = {
      quando: String(tr.get('created') || '').slice(0, 19),
      vendedor_nome: String(tr.get('vendedor_nome') || ''),
      vendedor_id: String(tr.get('vendedor_id') || ''),
      motivo: String(tr.get('motivo') || ''),
      estado: String(tr.get('estado') || ''),
      detalhe: String(tr.get('detalhe') || ''),
      lead: leadId.slice(0, 12),
    }

    // o lead
    var lead = null
    try {
      lead = app.findRecordById('crm_leads', leadId)
      var donoNome = '(sem dono)'
      const ow = String(lead.get('owner_id') || '')
      if (ow !== '') {
        try {
          const u = app.findRecordById('users', ow)
          donoNome = String(u.get('name') || u.get('email') || '')
        } catch (eU) {
          donoNome = '(usuario apagado)'
        }
      }
      out.lead = {
        nome: String(lead.get('nome') || ''),
        telefone: String(lead.get('telefone') || ''),
        status: String(lead.get('status') || ''),
        origem: String(lead.get('origem') || ''),
        dono: donoNome,
        criado: String(lead.get('created') || '').slice(0, 19),
      }
    } catch (e1) {
      out.lead = null
    }

    // a conversa desse telefone
    const tel = lead ? String(lead.get('telefone') || '') : ''
    if (tel !== '') {
      try {
        const cvs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_conversas'),
          "contato_telefone='" + tel.replace(/'/g, '') + "'",
          '',
          5,
          0,
        )
        out.conversas = []
        for (const c of cvs) {
          out.conversas.push({
            conexao: String(c.get('conexao') || '').slice(0, 10),
            estado: String(c.get('estado') || ''),
            etapa: String(c.get('etapa_atual') || ''),
            ultima: String(c.get('ultima_mensagem_em') || '').slice(0, 16),
            msgs: Number(c.get('total_mensagens') || 0),
          })
        }
      } catch (e2) {}

      // mensagens
      try {
        const ms = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_mensagens'),
          "contato_telefone='" + tel.replace(/'/g, '') + "'",
          '',
          40,
          0,
        )
        out.mensagens = []
        for (const m of ms) {
          out.mensagens.push({
            quando: String(m.get('created') || '').slice(0, 19),
            dir: String(m.get('direcao') || ''),
            autor: String(m.get('autor') || ''),
            texto: String(m.get('texto') || '').slice(0, 100),
          })
        }
        out.mensagens.sort(function (a, b) {
          return a.quando < b.quando ? -1 : 1
        })
      } catch (e3) {}

      // foi avisado ao cliente?
      try {
        const envs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_envios'),
          "destino_telefone='" + tel.replace(/'/g, '') + "'",
          '-created',
          10,
          0,
        )
        out.envios = []
        for (const x of envs) {
          out.envios.push({
            quando: String(x.get('created') || '').slice(0, 16),
            motivo: String(x.get('motivo') || ''),
            estado: String(x.get('estado') || ''),
            texto: String(x.get('texto') || '').slice(0, 120),
          })
        }
      } catch (e4) {}
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
