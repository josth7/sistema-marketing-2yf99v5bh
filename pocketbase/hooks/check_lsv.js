/// <reference path="../pb_data/types.d.ts" />
/**
 * LEADS PARADOS — dono que não atende + conversa sem lead (17/11).
 *
 * Pedido do dono: listar os leads dos últimos 30 dias cujo DONO NÃO É VENDEDOR
 * ATIVO, e as conversas SEM LEAD vinculado.
 *
 * "Vendedor ativo" = tem conexão `whatsapp_conexoes` papel `vendedor` e ativa.
 * É a MESMA régua do rodízio e do `wa_aviso_lead` (corrigido hoje).
 *
 * Só leitura. Nada é alterado.
 *
 * GET /backend/v1/check/leads-sem-vendedor
 */
routerAdd(
  'GET',
  '/backend/v1/check/leads-sem-vendedor',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = {
      ok: true,
      agora: new Date().toISOString().slice(0, 19),
      vendedores_ativos: [],
      com_dono_invalido: [],
      conversas_sem_lead: [],
      resumo: {},
    }

    // ---------- quem é vendedor ativo ----------
    const ativos = {}
    try {
      const cxs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='vendedor' && ativo=true && fixture=false",
        '',
        30,
        0,
      )
      for (const c of cxs) {
        const uid = String(c.get('vendedor_user') || '')
        if (uid !== '') {
          ativos[uid] = String(c.get('nome_exibicao') || '')
          out.vendedores_ativos.push({ nome: ativos[uid], user: uid.slice(0, 8) })
        }
      }
    } catch (e0) {}
    out.resumo.vendedores_ativos = out.vendedores_ativos.length

    // ---------- cache de nome de usuário ----------
    const nomeUser = {}
    function nomeDe(uid) {
      if (nomeUser[uid] !== undefined) return nomeUser[uid]
      var n = ''
      try {
        const u = app.findRecordById('users', uid)
        n = String(u.get('name') || '')
        if (n === '') n = '(' + String(u.get('email') || 'sem email') + ')'
      } catch (eU) {
        n = '(usuario apagado)'
      }
      nomeUser[uid] = n
      return n
    }

    // ---------- leads dos últimos 30 dias com dono inválido ----------
    const limite = new Date()
    limite.setDate(limite.getDate() - 30)
    const corte = limite.toISOString().slice(0, 10) + ' 00:00:00'

    var leads = []
    try {
      leads = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        "fixture=false && created>='" + corte + "'",
        '-created',
        4000,
        0,
      )
    } catch (e1) {
      out.erro_leads = String(e1).slice(0, 120)
    }
    out.resumo.leads_30d = leads.length

    var semDono = 0
    for (const l of leads) {
      const ow = String(l.get('owner_id') || '')
      if (ow !== '' && ativos[ow] !== undefined) continue // está com vendedor: ok
      if (ow === '') {
        semDono++
        continue
      }
      if (out.com_dono_invalido.length < 120) {
        const criado = String(l.get('created') || '')
        var dias = null
        try {
          dias = Math.round((new Date().getTime() - new Date(criado).getTime()) / 86400000)
        } catch (eD) {}
        out.com_dono_invalido.push({
          lead: l.id.slice(0, 10),
          nome: String(l.get('nome') || '').slice(0, 26),
          tel: String(l.get('telefone') || '').slice(-6),
          status: String(l.get('status') || ''),
          dono: nomeDe(ow),
          dono_id: ow.slice(0, 10),
          criado: criado.slice(0, 16),
          dias: dias,
        })
      }
    }
    out.resumo.leads_com_dono_invalido = out.com_dono_invalido.length
    out.resumo.leads_sem_dono = semDono

    // ---------- conversas sem lead ----------
    var central = null
    try {
      const cs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='central' && ativo=true && fixture=false",
        '',
        1,
        0,
      )
      if (cs.length > 0) central = cs[0]
    } catch (e2) {}

    if (central) {
      var cvs = []
      try {
        cvs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_conversas'),
          "conexao='" + central.id + "' && fixture=false && lead='' && created>='" + corte + "'",
          '-created',
          1000,
          0,
        )
      } catch (e3) {
        out.erro_conversas = String(e3).slice(0, 120)
      }
      for (const cv of cvs) {
        if (out.conversas_sem_lead.length >= 120) break
        out.conversas_sem_lead.push({
          conversa: cv.id.slice(0, 10),
          tel: String(cv.get('contato_telefone') || '').slice(-6),
          estado: String(cv.get('estado') || ''),
          etapa: String(cv.get('etapa_atual') || ''),
          msgs: Number(cv.get('total_mensagens') || 0),
          criada: String(cv.get('created') || '').slice(0, 16),
          ultima: String(cv.get('ultima_mensagem_em') || '').slice(0, 16),
        })
      }
    }
    out.resumo.conversas_sem_lead = out.conversas_sem_lead.length

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
