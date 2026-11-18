/// <reference path="../pb_data/types.d.ts" />
/**
 * CONTA DA SABRINA — por que não entra? (18/11)
 *
 * Verifica:
 *   1. a conta existe? qual e-mail exato?
 *   2. está verificada?
 *   3. tem grant ativo? qual papel e escopo?
 *   4. está suspensa?
 *   5. qual conexão de WhatsApp ela tem (se é vendedora ou da GOO7)
 *
 * Só leitura.
 *
 * GET /backend/v1/check/conta-sabrina
 */
routerAdd(
  'GET',
  '/backend/v1/check/conta-sabrina',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, contas: [] }

    // procura por qualquer coisa com "sabrina"
    var achadas = []
    try {
      achadas = app.findRecordsByFilter('users', "email~'sabrina'", '', 10, 0)
    } catch (e0) {
      out.erro = String(e0).slice(0, 120)
    }
    if (achadas.length === 0) {
      try {
        achadas = app.findRecordsByFilter('users', "name~'Sabrina'", '', 10, 0)
      } catch (e1) {}
    }

    for (const u of achadas) {
      const item = {
        id: u.id.slice(0, 12),
        nome: String(u.get('name') || '(VAZIO)'),
        email: String(u.get('email') || ''),
        verificado: u.get('verified') === true,
        criado: String(u.get('created') || '').slice(0, 16),
        atualizado: String(u.get('updated') || '').slice(0, 16),
        grants: [],
        conexoes: [],
      }

      // grants
      try {
        for (const g of app.findRecordsByFilter(
          'access_grants',
          "user_id='" + u.id + "' && revoked_at=''",
          '',
          10,
          0,
        )) {
          var atos = []
          var esc = []
          try {
            const rA = g.get('actions')
            atos =
              Array.isArray(rA) && rA.length > 0 && typeof rA[0] === 'number'
                ? JSON.parse(String.fromCharCode.apply(null, rA))
                : typeof rA === 'string'
                  ? JSON.parse(rA)
                  : rA || []
          } catch (eA) {}
          try {
            const rS = g.get('scope_accounts')
            esc =
              Array.isArray(rS) && rS.length > 0 && typeof rS[0] === 'number'
                ? JSON.parse(String.fromCharCode.apply(null, rS))
                : typeof rS === 'string'
                  ? JSON.parse(rS)
                  : rS || []
          } catch (eS) {}
          item.grants.push({
            role: String(g.get('role') || ''),
            acoes: Array.isArray(atos) ? atos.length : 0,
            escopo: Array.isArray(esc) ? esc.join(',') : '',
            empresa: String(g.get('empresa') || '').slice(0, 10),
          })
        }
      } catch (e2) {}

      // grants revogados (importante: é uma causa comum de "não entra")
      var revogados = 0
      try {
        revogados = app.findRecordsByFilter(
          'access_grants',
          "user_id='" + u.id + "' && revoked_at!=''",
          '',
          20,
          0,
        ).length
      } catch (e3) {}
      item.grants_revogados = revogados

      // conexões
      try {
        for (const c of app.findRecordsByFilter(
          'whatsapp_conexoes',
          "vendedor_user='" + u.id + "'",
          '',
          5,
          0,
        )) {
          item.conexoes.push({
            papel: String(c.get('papel') || ''),
            ativo: c.get('ativo') === true,
            nome: String(c.get('nome_exibicao') || '').slice(0, 24),
            numero: String(c.get('numero') || '').slice(-4),
          })
        }
      } catch (e4) {}

      out.contas.push(item)
    }

    out.total = out.contas.length
    // diagnóstico rápido
    if (out.total === 0) {
      out.diagnostico = 'NENHUMA conta com "sabrina" no e-mail ou no nome.'
    } else {
      const c = out.contas[0]
      if (!c.verificado) out.diagnostico = 'A conta NAO esta verificada.'
      else if (c.grants.length === 0)
        out.diagnostico = 'A conta nao tem grant ATIVO (pode estar revogado).'
      else out.diagnostico = 'A conta tem grant ativo. Se nao entra, e SENHA.'
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
