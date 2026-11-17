/// <reference path="../pb_data/types.d.ts" />
/**
 * DETALHE DO GRANT do rodrigo + TRANSFERÊNCIAS QUE MOSTRAM E-MAIL (17/11).
 *
 * Duas perguntas:
 *   1. qual grant o `rodrigo@adapta.org` tem? (pode ser conta de consultoria
 *      com permissão real — isso seria grave)
 *   2. quais transferências/envios mostram um E-MAIL no lugar do nome do
 *      vendedor? O código usa `u.get('name') || u.get('email')`, então usuário
 *      sem nome aparece como e-mail para o cliente.
 *
 * GET /backend/v1/check/rodrigo-detalhe
 */
routerAdd(
  'GET',
  '/backend/v1/check/rodrigo-detalhe',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, grant: null, vendedoresSemNome: [], enviosComEmail: [], resumo: {} }

    // ---------- 1. o grant ----------
    try {
      const gs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        "user_id='huvhy4jruz27'",
        '',
        5,
        0,
      )
      if (gs.length > 0) {
        // id completo pode ter outro sufixo; pega do primeiro
        const g = gs[0]
        out.grant = {
          role: String(g.get('role') || ''),
          empresa: String(g.get('empresa') || '').slice(0, 10),
          version: Number(g.get('version') || 0),
          revoked_at: String(g.get('revoked_at') || '(ativo)'),
          acoes: String(g.get('actions') || g.get('acoes') || '').slice(0, 200),
          escopo: String(g.get('scope_accounts') || g.get('escopo') || '').slice(0, 60),
          criado: String(g.get('created') || '').slice(0, 16),
        }
      }
    } catch (e0) {}

    // ---------- 2. usuários dados como vendedor SEM nome ----------
    try {
      const cxs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='vendedor'",
        '',
        40,
        0,
      )
      for (const c of cxs) {
        const uid = String(c.get('vendedor_user') || '')
        if (uid === '') continue
        var nome = ''
        var email = ''
        try {
          const u = app.findRecordById('users', uid)
          nome = String(u.get('name') || '')
          email = String(u.get('email') || '')
        } catch (eU) {
          nome = '(usuario apagado)'
        }
        if (nome === '') {
          out.vendedoresSemNome.push({
            conexao: String(c.get('nome_exibicao') || ''),
            vendedor_user: uid.slice(0, 10),
            email: email,
            ativo: c.get('ativo') === true,
            fixture: String(c.get('fixture')),
          })
        }
      }
    } catch (e1) {}

    // ---------- 3. envios que levam e-mail no texto ----------
    try {
      const envs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_envios'),
        "motivo='apresentacao_vendedor' || motivo='aviso_cliente' || motivo='vendedor_resposta'",
        '-created',
        300,
        0,
      )
      for (const x of envs) {
        const tx = String(x.get('texto') || '')
        const legacy = String(x.get('legenda') || '')
        if (tx.indexOf('@') >= 0 || legacy.indexOf('@') >= 0) {
          if (out.enviosComEmail.length < 20)
            out.enviosComEmail.push({
              quando: String(x.get('created') || '').slice(0, 16),
              motivo: String(x.get('motivo') || ''),
              estado: String(x.get('estado') || ''),
              dest: String(x.get('destino_telefone') || '').slice(-6),
              texto: (tx || legacy).slice(0, 140),
            })
        }
      }
    } catch (e2) {}

    // ---------- 4. transferências com e-mail no nome do vendedor ----------
    out.transferenciasComEmail = []
    try {
      const trs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_transferencias'),
        '',
        '-created',
        600,
        0,
      )
      for (const t of trs) {
        const vn = String(t.get('vendedor_nome') || '')
        if (vn.indexOf('@') >= 0) {
          if (out.transferenciasComEmail.length < 20)
            out.transferenciasComEmail.push({
              quando: String(t.get('created') || '').slice(0, 16),
              vendedor_nome: vn,
              estado: String(t.get('estado') || ''),
              motivo: String(t.get('motivo') || ''),
              lead: String(t.get('lead') || '').slice(0, 10),
            })
        }
      }
    } catch (e3) {}

    out.resumo = {
      grant: out.grant !== null,
      vendedoresSemNome: out.vendedoresSemNome.length,
      enviosComEmail: out.enviosComEmail.length,
      transferenciasComEmail: out.transferenciasComEmail.length,
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
