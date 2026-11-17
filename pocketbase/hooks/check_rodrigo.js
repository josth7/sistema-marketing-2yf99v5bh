/// <reference path="../pb_data/types.d.ts" />
/**
 * INVESTIGA "email rodrigo" numa transferência (17/11).
 *
 * O dono disse: "na sexta uma transferência apontou email rodrigo".
 *
 * Sexta-feira da semana passada = 2026-11-13. Aqui se procura, em tudo o que
 * aparece na tela de transferências/CRM:
 *   - usuários com "rodrigo" no nome ou no e-mail;
 *   - transferências de 13/11 (e arredores) cujo vendedor/user contenha rodrigo;
 *   - leads cujo owner_id seja esse usuário;
 *   - conversas cujo ultimo_autor ou nome exibido contenha rodrigo.
 *
 * GET /backend/v1/check/rodrigo
 */
routerAdd(
  'GET',
  '/backend/v1/check/rodrigo',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = {
      ok: true,
      usuarios: [],
      transferencias: [],
      leads: [],
      mensagens: [],
      resumo: {},
    }

    // ---------- 1. usuários com rodrigo ----------
    const idsRodrigo = []
    try {
      const us = app.findRecordsByFilter(app.findCollectionByNameOrId('users'), '', '', 400, 0)
      for (const u of us) {
        const nm = String(u.get('name') || '')
        const em = String(u.get('email') || '')
        if (nm.toLowerCase().indexOf('rodrigo') >= 0 || em.toLowerCase().indexOf('rodrigo') >= 0) {
          idsRodrigo.push(u.id)
          out.usuarios.push({
            id: u.id.slice(0, 10),
            nome: nm,
            email: em,
            criado: String(u.get('created') || '').slice(0, 16),
          })
        }
      }
    } catch (e0) {}

    // ---------- 2. conexões com rodrigo ----------
    out.conexoes = []
    try {
      for (const c of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        '',
        '',
        60,
        0,
      )) {
        const nm = String(c.get('nome_exibicao') || '')
        const pub = String(c.get('vendedor_nome_publico') || '')
        const uid = String(c.get('vendedor_user') || '')
        if (
          nm.toLowerCase().indexOf('rodrigo') >= 0 ||
          pub.toLowerCase().indexOf('rodrigo') >= 0 ||
          idsRodrigo.indexOf(uid) >= 0
        ) {
          out.conexoes.push({
            nome: nm,
            publico: pub,
            papel: String(c.get('papel') || ''),
            ativo: c.get('ativo') === true,
            fixture: String(c.get('fixture')),
            user: uid.slice(0, 10),
            numero: String(c.get('numero') || '').slice(-6),
          })
        }
      }
    } catch (e1) {}

    // ---------- 3. transferências de 12 a 15/11 com rodrigo ----------
    try {
      const trs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_transferencias'),
        "created>='2026-11-12' && created<='2026-11-16'",
        '-created',
        300,
        0,
      )
      for (const t of trs) {
        const vn = String(t.get('vendedor_nome') || '')
        const vid = String(t.get('vendedor_id') || '')
        const det = String(t.get('detalhe') || '')
        if (
          vn.toLowerCase().indexOf('rodrigo') >= 0 ||
          det.toLowerCase().indexOf('rodrigo') >= 0 ||
          idsRodrigo.indexOf(vid) >= 0
        ) {
          out.transferencias.push({
            quando: String(t.get('created') || '').slice(0, 16),
            vendedor_nome: vn,
            vendedor_id: vid.slice(0, 12),
            motivo: String(t.get('motivo') || ''),
            estado: String(t.get('estado') || ''),
            detalhe: det.slice(0, 120),
            lead: String(t.get('lead') || '').slice(0, 12),
          })
        }
      }
    } catch (e2) {}

    // ---------- 4. leads com esse dono ----------
    for (const rid of idsRodrigo) {
      try {
        const ls = app.findRecordsByFilter(
          app.findCollectionByNameOrId('crm_leads'),
          "owner_id='" + rid + "'",
          '-created',
          20,
          0,
        )
        for (const l of ls) {
          out.leads.push({
            id: l.id.slice(0, 10),
            nome: String(l.get('nome') || '').slice(0, 20),
            tel: String(l.get('telefone') || '').slice(-6),
            status: String(l.get('status') || ''),
            criado: String(l.get('created') || '').slice(0, 16),
          })
        }
      } catch (e3) {}
    }

    // ---------- 5. textos com rodrigo (mensagens e eventos de 12 a 16/11) ----------
    try {
      const ms = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "created>='2026-11-12' && created<='2026-11-16'",
        '-created',
        4000,
        0,
      )
      for (const m of ms) {
        const tx = String(m.get('texto') || '')
        if (tx.toLowerCase().indexOf('rodrigo') >= 0) {
          if (out.mensagens.length < 15)
            out.mensagens.push({
              quando: String(m.get('created') || '').slice(0, 16),
              dir: String(m.get('direcao') || ''),
              autor: String(m.get('autor') || ''),
              tel: String(m.get('contato_telefone') || '').slice(-6),
              texto: tx.slice(0, 160),
            })
        }
      }
    } catch (e4) {}

    out.resumo = {
      usuarios: out.usuarios.length,
      conexoes: (out.conexoes || []).length,
      transferencias: out.transferencias.length,
      leads: out.leads.length,
      mensagens: out.mensagens.length,
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
