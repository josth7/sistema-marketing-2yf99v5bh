/// <reference path="../pb_data/types.d.ts" />
// Prova a LOGICA do item 2 exatamente como esta no hook publicado:
// dono invalido -> nao protege, vai para Precisa de acao, sem aviso ao cliente.
routerAdd(
  'GET',
  '/backend/v1/check/prova-logica-item2',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, passos: [], green: false }
    // 1. acha o consultor
    var uidCons = ''
    try {
      const us = app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        "email='rodrigo@adapta.org'",
        '',
        1,
        0,
      )
      if (us.length) uidCons = us[0].id
    } catch (e0) {}
    // 2. acha um vendedor real
    var cxVend = null
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='vendedor' && ativo=true && fixture=false",
      '',
      1,
      0,
    ))
      cxVend = c
    if (uidCons === '' || !cxVend)
      return e.json(200, { ok: false, erro: 'faltou consultor ou vendedor' })
    const uidVend = String(cxVend.get('vendedor_user') || '')

    // a REGRA do hook, replicada
    const checaDono = function (donoId) {
      if (donoId === '') return 'sem_dono'
      var ativo = false
      try {
        const cx = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_conexoes'),
          "vendedor_user='" + donoId + "' && papel='vendedor' && ativo=true",
          '',
          1,
          0,
        )
        ativo = !!(cx && cx.length > 0)
      } catch (e1) {}
      if (!ativo) return 'dono_invalido_para_precisa_acao'
      return 'duplicada_nao_troca'
    }

    const caso1 = checaDono(uidCons)
    const caso2 = checaDono(uidVend)
    const caso3 = checaDono('')

    out.passos.push({
      passo: 'dono = CONSULTOR (sem conexao) -> vai para Precisa de acao, NAO protege',
      ok: caso1 === 'dono_invalido_para_precisa_acao',
      valor: caso1,
    })
    out.passos.push({
      passo: 'dono = VENDEDOR ativo -> trava vale (duplicada, nao troca)',
      ok: caso2 === 'duplicada_nao_troca',
      valor: caso2,
    })
    out.passos.push({
      passo: 'sem dono -> segue para rodizio',
      ok: caso3 === 'sem_dono',
      valor: caso3,
    })

    // 3. e o lead de teste: qual seria o destino?
    try {
      const ls = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        "nome~'TESTE ITEM2'",
        '',
        1,
        0,
      )
      if (ls.length) {
        const ow = String(ls[0].get('owner_id') || '')
        out.lead_teste_destino = checaDono(ow)
        out.passos.push({
          passo: 'o lead de teste (dono consultor) seria enviado a Precisa de acao',
          ok: out.lead_teste_destino === 'dono_invalido_para_precisa_acao',
          valor: out.lead_teste_destino,
        })
      }
    } catch (e2) {}
    out.green = out.passos.every(function (p) {
      return p.ok
    })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
