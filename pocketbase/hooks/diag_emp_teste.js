/// <reference path="../pb_data/types.d.ts" />
/**
 * EMPRESA DE TESTE PARA O ISOLAMENTO (11/11) — CA-3-91.
 *
 * O card pede "usuários fixture das duas empresas" e a varredura provando zero
 * vazamento. Só existe a Haisan — sem uma segunda empresa, o teste não prova
 * nada.
 *
 * **Esta rota cria a empresa de teste** (`TESTE Isolamento`, inativa) e **dados
 * de teste** nela: 1 conversa, 1 lead e 1 contato de carteira, todos `fixture`.
 *
 * **Não cria usuário nem conexão de WhatsApp:** não dá para inventar número nem
 * login sem risco. O isolamento é provado pelo **dado**, que é o que vaza.
 *
 * GET /backend/v1/diag/cria-empresa-teste
 */
routerAdd(
  'GET',
  '/backend/v1/diag/cria-empresa-teste',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, passos: [] }

    // 1. a empresa de teste existe?
    var idTeste = ''
    try {
      const es = app.findRecordsByFilter('empresas', "apelido='TESTE'", '', 1, 0)
      if (es.length > 0) idTeste = es[0].id
    } catch (e0) {}
    if (idTeste === '') {
      try {
        const col = app.findCollectionByNameOrId('empresas')
        const emp = new Record(col)
        emp.set('nome', 'Empresa de Teste — Isolamento')
        emp.set('apelido', 'TESTE')
        emp.set('cnpj', '')
        emp.set('ativa', false) // INATIVA: não aparece para ninguém
        emp.set('criada_em', new Date().toISOString())
        app.save(emp)
        idTeste = emp.id
        out.passos.push({ passo: '1. empresa TESTE criada', ok: true, id: idTeste.slice(0, 10) })
      } catch (e1) {
        return e.json(200, { ok: false, erro: 'criar empresa: ' + String(e1).slice(0, 120) })
      }
    } else {
      out.passos.push({ passo: '1. empresa TESTE já existia', ok: true, id: idTeste.slice(0, 10) })
    }

    // 2. dados de teste DENTRO da empresa TESTE
    var criados = 0
    try {
      // lead
      const colL = app.findCollectionByNameOrId('crm_leads')
      const jaL = app.findRecordsByFilter(colL, "telefone='41999990001'", '', 1, 0)
      if (!jaL || jaL.length === 0) {
        const l = new Record(colL)
        l.set('nome', 'LEAD DA EMPRESA TESTE')
        l.set('telefone', '41999990001')
        l.set('status', 'entrada_lead')
        l.set('origem', 'teste')
        l.set('empresa', idTeste)
        l.set('fixture', true)
        app.save(l)
        criados++
      }
      // conversa
      const colC = app.findCollectionByNameOrId('whatsapp_conversas')
      const jaC = app.findRecordsByFilter(colC, "contato_telefone='41999990001'", '', 1, 0)
      if (!jaC || jaC.length === 0) {
        const c = new Record(colC)
        c.set('contato_telefone', '41999990001')
        c.set('contato_nome', 'CONVERSA DA EMPRESA TESTE')
        c.set('estado', 'triagem')
        c.set('total_mensagens', 0)
        c.set('empresa', idTeste)
        c.set('fixture', true)
        app.save(c)
        criados++
      }
      // carteira
      const colCart = app.findCollectionByNameOrId('carteira_contatos')
      const jaCart = app.findRecordsByFilter(colCart, "telefone='41999990001'", '', 1, 0)
      if (!jaCart || jaCart.length === 0) {
        const ct = new Record(colCart)
        ct.set('nome', 'CONTATO DA EMPRESA TESTE')
        ct.set('telefone', '41999990001')
        ct.set('empresa', idTeste)
        ct.set('fixture', true)
        ct.set('origem_carteira', 'teste')
        app.save(ct)
        criados++
      }
    } catch (e2) {
      out.passos.push({ passo: '2. dados de teste', ok: false, erro: String(e2).slice(0, 120) })
    }
    out.passos.push({
      passo: '2. dados de teste na empresa TESTE',
      ok: true,
      detalhe: criados + ' criado(s)',
    })

    out.empresa_teste = idTeste
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
