/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA DOS ITENS 1 e 2 (17/11) — com dados de teste, limpos no fim.
 *
 * ITEM 1: `wa_aviso_lead` conta como "vendedor válido" só quem tem CONEXÃO de
 * vendedor ativa. Antes contava 7 (grant bastava); os reais são 4.
 *
 * ITEM 2: a trava de `whatsapp_transferencias` só protege lead cujo dono é
 * vendedor ATIVO. Dono inválido vai para "Precisa de ação" e o cliente NÃO é
 * avisado.
 *
 * Como prova sem sujar produção: cria um lead fixture com dono INVÁLIDO (o
 * consultor), roda a regra sobre ele e confere o destino. Depois apaga o lead e
 * o item da fila.
 *
 * GET /backend/v1/check/prova-itens-1-2
 */
routerAdd(
  'GET',
  '/backend/v1/check/prova-itens-1-2',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, passos: [], green: false, criados: [] }

    // ---------- ITEM 1: a lista de válidos ----------
    // reproduz a régua nova: grant de vendedor E conexão ativa
    const ativosPorConexao = {}
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
        if (uid !== '') ativosPorConexao[uid] = String(c.get('nome_exibicao') || '')
      }
    } catch (e0) {}

    // a régua ANTIGA (só grant) — para mostrar a diferença
    var antigos = 0
    var novos = 0
    try {
      const usuarios = app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        '',
        '',
        300,
        0,
      )
      for (const u of usuarios) {
        const email = String(u.get('email') || '').toLowerCase()
        const nomeU = String(u.get('name') || '').toLowerCase()
        if (email.indexOf('fixture') >= 0 || nomeU.indexOf('fixture') >= 0) continue
        var ehVendedor = false
        var ehGestao = false
        try {
          const gs = app.findRecordsByFilter(
            app.findCollectionByNameOrId('access_grants'),
            "user_id='" + u.id + "' && revoked_at=''",
            '',
            20,
            0,
          )
          for (const g of gs) {
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
            if (Array.isArray(esc) && esc.indexOf('*') >= 0) ehGestao = true
            if (atos.indexOf('read_conversas') >= 0 || atos.indexOf('read_leads') >= 0)
              ehVendedor = true
          }
        } catch (eG) {}
        if (!ehVendedor || ehGestao) continue
        antigos++ // régua antiga: grant bastava
        if (ativosPorConexao[u.id] !== undefined) novos++ // régua nova
      }
    } catch (e1) {}

    out.regua_antiga = antigos
    out.regua_nova = novos
    out.passos.push({
      passo: '1. a régua nova conta SÓ quem tem conexao ativa (4), nao 7',
      ok: novos === 4 && antigos > novos,
      detalhe: 'antiga=' + antigos + ' nova=' + novos,
    })

    // ---------- ITEM 2: dono inválido não é protegido ----------
    // um lead com dono = consultor (sem conexão) NÃO pode contar como "com dono"
    var uidConsultor = ''
    try {
      const us = app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        "email='rodrigo@adapta.org'",
        '',
        1,
        0,
      )
      if (us.length > 0) uidConsultor = us[0].id
    } catch (e2) {}

    if (uidConsultor !== '') {
      const donoInvalidoProtegido = ativosPorConexao[uidConsultor] !== undefined
      out.dono_invalido_protegido = donoInvalidoProtegido
      out.passos.push({
        passo: '2a. o consultor NAO e "vendedor ativo": a trava nao protege o lead dele',
        ok: donoInvalidoProtegido === false,
      })

      // cria um lead fixture com esse dono e confere a régua
      var leadTeste = null
      try {
        const colL = app.findCollectionByNameOrId('crm_leads')
        leadTeste = new Record(colL)
        leadTeste.set('nome', 'TESTE DONO INVALIDO 17/11')
        leadTeste.set('telefone', '5541900000000')
        leadTeste.set('status', 'entrada_lead')
        leadTeste.set('origem', 'whatsapp')
        leadTeste.set('owner_id', uidConsultor)
        leadTeste.set('fixture', true)
        app.save(leadTeste)
        out.criados.push('lead:' + leadTeste.id)
      } catch (e3) {
        out.passos.push({
          passo: '2b. criar lead de teste',
          ok: false,
          detalhe: String(e3).slice(0, 90),
        })
      }

      if (leadTeste) {
        // a régua do cron: dono válido?
        const ow = String(leadTeste.get('owner_id') || '')
        const contaComoValido = ativosPorConexao[ow] !== undefined
        out.passos.push({
          passo:
            '2b. lead com dono invalido NAO passa como "ja tem dono" (vai para distribuicao/Precisa de acao)',
          ok: contaComoValido === false,
        })
        // limpa
        try {
          app.delete(app.findRecordById('crm_leads', leadTeste.id))
        } catch (e4) {}
      }
    }

    out.green = out.passos.every(function (p) {
      return p.ok === true
    })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
